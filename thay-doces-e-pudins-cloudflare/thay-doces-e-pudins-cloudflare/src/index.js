// Site da Thay Doces&Pudins — Cloudflare Worker + banco D1.
// Cada camada de segurança está comentada no código.
import {
  esc, real, textoIgual, tokenAleatorio, lerSessao, cookieSessao, prepararBanco, dentroDoLimite,
  validarProduto, validarPedido, tipoDaImagem, enderecoSeguro,
  CATEGORIAS, STATUS_PEDIDO, TIPOS_ENTREGA, MAX_QTD_ITEM, MAX_ITENS_CARRINHO, MAX_IMAGEM_BYTES, ADMIN_MINUTOS,
} from "./util.js";
import * as V from "./views.js";

const MENSAGENS = {
  400: "Requisição inválida. Volte e tente de novo.",
  403: "Você não tem permissão para acessar esta página.",
  404: "Ops! Não encontramos o que você procura.",
  413: "O arquivo é grande demais.",
  429: "Muitas tentativas. Aguarde um pouquinho e tente de novo.",
  500: "Algo deu errado do nosso lado. Tente novamente mais tarde.",
};

class HttpErro extends Error { constructor(codigo) { super(String(codigo)); this.codigo = codigo; } }
class Saida extends Error { constructor(resposta) { super("saida"); this.resposta = resposta; } }

// Cabeçalhos de segurança em TODAS as respostas (CSP restritiva, anti-clickjacking, nosniff, HSTS...)
const CABECALHOS = {
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

// ---------------------------------------------------------------- utilidades de resposta
const redirecionar = (caminho) => new Response(null, { status: 302, headers: { Location: caminho } });
const flash = (ctx, cat, msg) => ctx.sessao.flash.push([cat, msg]);

function pagina(ctx, titulo, corpo, { scripts = [], status = 200 } = {}) {
  const mensagens = ctx.sessao.flash;
  ctx.sessao.flash = [];                                   // mensagens aparecem uma vez só
  const qtd = Object.values(ctx.sessao.carrinho).reduce((a, b) => a + (Number(b) || 0), 0);
  const html = V.layout({ titulo, corpo, qtd, flash: mensagens, scripts });
  return new Response(String(html), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const paginaDeErro = (ctx, codigo) =>
  pagina(ctx, `Erro ${codigo} — Thay Doces&Pudins`, V.paginaErro(codigo, MENSAGENS[codigo] ?? MENSAGENS[500]), { status: codigo });

function exigirAdmin(ctx) {
  if (!ctx.sessao.adminAte) {
    flash(ctx, "erro", "Faça login para acessar o painel.");
    throw new Saida(redirecionar("/login"));
  }
  ctx.sessao.adminAte = Date.now() + ADMIN_MINUTOS * 60 * 1000;   // renova a cada uso
}

async function verificarCsrf(ctx) {
  const token = String(ctx.form.get("csrf_token") ?? "");
  if (!token || !(await textoIgual(token, ctx.sessao.csrf, ctx.env.SECRET_KEY))) throw new HttpErro(400);
}

// ---------------------------------------------------------------- carrinho
async function itensCarrinho(ctx) {
  const bruto = ctx.sessao.carrinho;
  const ids = Object.keys(bruto).filter((k) => /^\d+$/.test(k)).map(Number);
  if (!ids.length) return { itens: [], total: 0 };
  const { results } = await ctx.db.prepare(
    `SELECT * FROM produto WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const itens = [];
  let total = 0;
  for (const p of results) {              // produto excluído some do carrinho
    const qtd = Math.max(1, Math.min(parseInt(bruto[p.id], 10) || 1, MAX_QTD_ITEM));
    const sub = Math.round(p.preco * qtd * 100) / 100;
    itens.push({ p, qtd, sub });
    total += sub;
  }
  return { itens, total: Math.round(total * 100) / 100 };
}

function mensagemWhatsApp(ctx, pedido, itens) {
  const linhas = [`Olá! Fiz o pedido #${pedido.id} pelo site da Thay Doces&Pudins:`];
  for (const i of itens) linhas.push(`- ${i.quantidade}x ${i.nome} (${real(i.preco * i.quantidade)})`);
  linhas.push(`Total: ${real(pedido.total)}`, `Nome: ${pedido.cliente}`);
  linhas.push(TIPOS_ENTREGA[pedido.tipo] + (pedido.endereco ? `: ${pedido.endereco}` : ""));
  if (pedido.observacao) linhas.push(`Obs.: ${pedido.observacao}`);
  const numero = String(ctx.env.WHATSAPP_LOJA || "5511994811430").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(linhas.join("\n"))}`;
}

// ---------------------------------------------------------------- imagens (guardadas no banco)
function paraBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function salvarImagem(db, arquivo) {
  if (arquivo.size > MAX_IMAGEM_BYTES) throw new Error("A imagem é grande demais (máximo 1 MB).");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoDaImagem(bytes);              // confere o conteúdo real, não só a extensão
  if (!tipo) throw new Error("O arquivo enviado não é uma imagem válida (use png, jpg ou webp).");
  const r = await db.prepare("INSERT INTO imagem (tipo, dados) VALUES (?, ?)").bind(tipo, paraBase64(bytes)).run();
  return r.meta.last_row_id;
}

const apagarImagem = (db, id) => (id ? db.prepare("DELETE FROM imagem WHERE id = ?").bind(id).run() : null);

async function servirImagem(env, id) {
  const img = await env.DB.prepare("SELECT tipo, dados FROM imagem WHERE id = ?").bind(id).first();
  if (!img) return new Response("Não encontrada", { status: 404 });
  return new Response(Uint8Array.from(atob(img.dados), (c) => c.charCodeAt(0)), {
    headers: {
      "Content-Type": img.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

// ---------------------------------------------------------------- rotas
async function rotear(ctx) {
  const { req, url, db } = ctx;
  const m = req.method;
  const caminho = url.pathname.replace(/\/+$/, "") || "/";
  let r;

  if (m === "POST") {
    if (Number(req.headers.get("Content-Length") || 0) > 2 * 1024 * 1024) throw new HttpErro(413);
    try { ctx.form = await req.formData(); } catch { throw new HttpErro(400); }
    await verificarCsrf(ctx);                    // proteção CSRF em TODO formulário
  }

  // ----- públicas
  if (m === "GET" && caminho === "/") {
    const { results } = await db.prepare("SELECT * FROM produto ORDER BY id DESC LIMIT 4").all();
    return pagina(ctx, "Thay Doces&Pudins", V.paginaInicio(results, ctx.sessao.csrf));
  }
  if (m === "GET" && caminho === "/produtos") {
    const cat = url.searchParams.get("categoria") || "";
    const q = CATEGORIAS.includes(cat)
      ? db.prepare("SELECT * FROM produto WHERE categoria = ? ORDER BY nome").bind(cat)
      : db.prepare("SELECT * FROM produto ORDER BY nome");
    const { results } = await q.all();
    return pagina(ctx, "Produtos — Thay Doces&Pudins", V.paginaProdutos(results, CATEGORIAS.includes(cat) ? cat : "", ctx.sessao.csrf));
  }

  // ----- carrinho
  if (m === "GET" && caminho === "/carrinho") {
    const { itens, total } = await itensCarrinho(ctx);
    return pagina(ctx, "Carrinho — Thay Doces&Pudins", V.paginaCarrinho(itens, total, ctx.sessao.csrf));
  }
  if (m === "POST" && (r = caminho.match(/^\/carrinho\/adicionar\/(\d+)$/))) {
    const p = await db.prepare("SELECT id, nome FROM produto WHERE id = ?").bind(Number(r[1])).first();
    if (!p) throw new HttpErro(404);
    const c = ctx.sessao.carrinho;
    if (!(String(p.id) in c) && Object.keys(c).length >= MAX_ITENS_CARRINHO) {
      flash(ctx, "erro", "Seu carrinho está cheio. Finalize o pedido primeiro.");
      return redirecionar("/carrinho");
    }
    c[p.id] = Math.min((parseInt(c[p.id], 10) || 0) + 1, MAX_QTD_ITEM);
    flash(ctx, "sucesso", `${p.nome} foi para o carrinho! 🛒`);
    return redirecionar(enderecoSeguro(String(ctx.form.get("voltar") ?? ""), "/produtos"));   // anti open redirect
  }
  if (m === "POST" && (r = caminho.match(/^\/carrinho\/atualizar\/(\d+)$/))) {
    const c = ctx.sessao.carrinho;
    if (r[1] in c) {
      const qtd = parseInt(String(ctx.form.get("quantidade") ?? "1"), 10);
      if (!(qtd > 0)) delete c[r[1]]; else c[r[1]] = Math.min(qtd, MAX_QTD_ITEM);
    }
    return redirecionar("/carrinho");
  }
  if (m === "POST" && (r = caminho.match(/^\/carrinho\/remover\/(\d+)$/))) {
    delete ctx.sessao.carrinho[r[1]];
    flash(ctx, "sucesso", "Item removido do carrinho.");
    return redirecionar("/carrinho");
  }

  // ----- finalizar pedido
  if (caminho === "/finalizar" && (m === "GET" || m === "POST")) {
    const { itens, total } = await itensCarrinho(ctx);
    if (!itens.length) {
      flash(ctx, "erro", "Seu carrinho está vazio. Escolha alguns docinhos! 🍬");
      return redirecionar("/produtos");
    }
    let dados = { cliente: "", telefone: "", tipo: "retirada", endereco: "", observacao: "" };
    if (m === "POST") {
      if (!(await dentroDoLimite(db, `pedido:${ctx.ip}`, 10, 3600))) throw new HttpErro(429);   // anti spam
      if (ctx.form.get("campo_extra")) return redirecionar("/");                                  // campo-isca: robô
      const v = validarPedido(ctx.form);
      dados = v.dados;
      if (v.erros.length) {
        v.erros.forEach((e) => flash(ctx, "erro", e));
      } else {
        const codigo = tokenAleatorio(16);              // link de confirmação impossível de adivinhar
        const agora = new Date().toISOString();
        await db.batch([
          db.prepare(`INSERT INTO pedido (codigo, cliente, telefone, tipo, endereco, observacao, total, status, criado_em)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'Novo', ?)`)
            .bind(codigo, dados.cliente, dados.telefone, dados.tipo, dados.endereco, dados.observacao, total, agora),
          // preço e nome ficam congelados no pedido; tudo no mesmo lote (ou grava tudo ou nada)
          ...itens.map(({ p, qtd }) => db.prepare(
            `INSERT INTO item_pedido (pedido_id, produto_id, nome, preco, quantidade)
             VALUES ((SELECT id FROM pedido WHERE codigo = ?), ?, ?, ?, ?)`).bind(codigo, p.id, p.nome, p.preco, qtd)),
        ]);
        ctx.sessao.carrinho = {};
        console.log(`Novo pedido total=${total}`);        // sem dados pessoais no log
        return redirecionar(`/pedido/${codigo}`);
      }
    }
    return pagina(ctx, "Finalizar pedido — Thay Doces&Pudins", V.paginaFinalizar(itens, total, dados, ctx.sessao.csrf),
      { scripts: ["/js/pedido.js"] });
  }
  if (m === "GET" && (r = caminho.match(/^\/pedido\/([\w-]{10,40})$/))) {
    const pedido = await db.prepare("SELECT * FROM pedido WHERE codigo = ?").bind(r[1]).first();
    if (!pedido) throw new HttpErro(404);
    const { results } = await db.prepare("SELECT * FROM item_pedido WHERE pedido_id = ? ORDER BY id").bind(pedido.id).all();
    return pagina(ctx, "Pedido recebido — Thay Doces&Pudins", V.paginaConfirmado(pedido, results, mensagemWhatsApp(ctx, pedido, results)));
  }

  // ----- login / logout
  if (m === "GET" && caminho === "/login") {
    return pagina(ctx, "Login — Thay Doces&Pudins", V.paginaLogin(ctx.sessao.csrf));
  }
  if (m === "POST" && caminho === "/login") {
    if (!(await dentroDoLimite(db, `login:${ctx.ip}`, 5, 60))) throw new HttpErro(429);          // freia força bruta
    const usuario = String(ctx.form.get("usuario") ?? "");
    const senha = String(ctx.form.get("senha") ?? "");
    const { ADMIN_USER = "", ADMIN_PASSWORD = "", SECRET_KEY } = ctx.env;
    const okUser = await textoIgual(usuario, ADMIN_USER, SECRET_KEY);
    const okSenha = await textoIgual(senha, ADMIN_PASSWORD, SECRET_KEY);
    if (ADMIN_PASSWORD && okUser && okSenha) {
      ctx.sessao.csrf = tokenAleatorio(16);                      // novo token (evita fixação de sessão)
      ctx.sessao.adminAte = Date.now() + ADMIN_MINUTOS * 60 * 1000;
      console.log("Login do admin OK");
      flash(ctx, "sucesso", "Bem-vinda de volta! 💖");
      return redirecionar("/admin");
    }
    console.warn(`Login FALHOU ip=${ctx.ip}`);
    flash(ctx, "erro", "Usuário ou senha inválidos.");     // mensagem genérica
    return redirecionar("/login");
  }
  if (m === "POST" && caminho === "/logout") {
    delete ctx.sessao.adminAte;
    ctx.sessao.csrf = tokenAleatorio(16);
    flash(ctx, "sucesso", "Você saiu do painel.");
    return redirecionar("/");
  }

  // ----- admin
  if (caminho.startsWith("/admin")) {
    exigirAdmin(ctx);

    if (m === "GET" && caminho === "/admin") {
      const { results } = await db.prepare("SELECT * FROM produto ORDER BY id DESC").all();
      return pagina(ctx, "Admin — Thay Doces&Pudins", V.paginaAdmin(results, null, ctx.sessao.csrf), { scripts: ["/js/admin.js"] });
    }

    if (m === "POST" && caminho === "/admin/cadastrar") {
      const v = validarProduto(ctx.form);
      let imagemId = null;
      const arq = ctx.form.get("imagem");
      if (!v.erros.length && arq && typeof arq === "object" && arq.size > 0) {
        try { imagemId = await salvarImagem(db, arq); } catch (e) { v.erros.push(e.message); }
      }
      if (v.erros.length) { v.erros.forEach((e) => flash(ctx, "erro", e)); return redirecionar("/admin"); }
      await db.prepare("INSERT INTO produto (nome, descricao, preco, categoria, imagem_id) VALUES (?, ?, ?, ?, ?)")
        .bind(v.dados.nome, v.dados.descricao, v.dados.preco, v.dados.categoria, imagemId).run();
      console.log("Admin cadastrou produto");
      flash(ctx, "sucesso", "Produto cadastrado com sucesso! 🍮");
      return redirecionar("/admin");
    }

    if ((r = caminho.match(/^\/admin\/editar\/(\d+)$/))) {
      const id = Number(r[1]);
      const p = await db.prepare("SELECT * FROM produto WHERE id = ?").bind(id).first();
      if (!p) throw new HttpErro(404);
      if (m === "GET") {
        const { results } = await db.prepare("SELECT * FROM produto ORDER BY id DESC").all();
        return pagina(ctx, "Admin — Thay Doces&Pudins", V.paginaAdmin(results, p, ctx.sessao.csrf), { scripts: ["/js/admin.js"] });
      }
      if (m === "POST") {
        const v = validarProduto(ctx.form);
        let nova = null;
        const arq = ctx.form.get("imagem");
        if (!v.erros.length && arq && typeof arq === "object" && arq.size > 0) {
          try { nova = await salvarImagem(db, arq); } catch (e) { v.erros.push(e.message); }
        }
        if (v.erros.length) { v.erros.forEach((e) => flash(ctx, "erro", e)); return redirecionar(`/admin/editar/${id}`); }
        await db.prepare("UPDATE produto SET nome=?, descricao=?, preco=?, categoria=?, imagem_id=? WHERE id=?")
          .bind(v.dados.nome, v.dados.descricao, v.dados.preco, v.dados.categoria, nova ?? p.imagem_id, id).run();
        if (nova) await apagarImagem(db, p.imagem_id);          // sem imagem nova, mantém a atual
        console.log(`Admin editou produto id=${id}`);
        flash(ctx, "sucesso", "Produto atualizado! ✨");
        return redirecionar("/admin");
      }
    }

    if (m === "POST" && (r = caminho.match(/^\/admin\/excluir\/(\d+)$/))) {       // exclusão só via POST
      const id = Number(r[1]);
      const p = await db.prepare("SELECT * FROM produto WHERE id = ?").bind(id).first();
      if (!p) throw new HttpErro(404);
      await apagarImagem(db, p.imagem_id);
      await db.prepare("DELETE FROM produto WHERE id = ?").bind(id).run();
      console.log(`Admin excluiu produto id=${id}`);
      flash(ctx, "sucesso", "Produto excluído.");
      return redirecionar("/admin");
    }

    if (m === "GET" && caminho === "/admin/pedidos") {
      const filtro = url.searchParams.get("status") || "";
      const f = STATUS_PEDIDO.includes(filtro) ? filtro : "";
      const q = f ? db.prepare("SELECT * FROM pedido WHERE status = ? ORDER BY id DESC").bind(f)
                  : db.prepare("SELECT * FROM pedido ORDER BY id DESC");
      const { results: pedidos } = await q.all();
      const porPedido = {};
      if (pedidos.length) {
        const ids = pedidos.map((p) => p.id);
        const { results: itens } = await db.prepare(
          `SELECT * FROM item_pedido WHERE pedido_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all();
        for (const i of itens) (porPedido[i.pedido_id] ||= []).push(i);
      }
      return pagina(ctx, "Pedidos — Thay Doces&Pudins", V.paginaPedidos(pedidos, porPedido, f, STATUS_PEDIDO, ctx.sessao.csrf),
        { scripts: ["/js/admin.js"] });
    }

    if (m === "POST" && (r = caminho.match(/^\/admin\/pedidos\/(\d+)\/status$/))) {
      const id = Number(r[1]);
      const novo = String(ctx.form.get("status") ?? "");
      if (!STATUS_PEDIDO.includes(novo)) throw new HttpErro(400);       // lista permitida
      const res = await db.prepare("UPDATE pedido SET status = ? WHERE id = ?").bind(novo, id).run();
      if (!res.meta.changes) throw new HttpErro(404);
      console.log(`Admin mudou pedido id=${id} para ${novo}`);
      flash(ctx, "sucesso", `Pedido #${id} agora está: ${novo}.`);
      const f = String(ctx.form.get("filtro") ?? "");
      return redirecionar(STATUS_PEDIDO.includes(f) ? `/admin/pedidos?status=${encodeURIComponent(f)}` : "/admin/pedidos");
    }

    if (m === "POST" && (r = caminho.match(/^\/admin\/pedidos\/(\d+)\/excluir$/))) {
      const id = Number(r[1]);
      const res = await db.batch([
        db.prepare("DELETE FROM item_pedido WHERE pedido_id = ?").bind(id),
        db.prepare("DELETE FROM pedido WHERE id = ?").bind(id),
      ]);
      if (!res[1].meta.changes) throw new HttpErro(404);
      console.log(`Admin excluiu pedido id=${id}`);
      flash(ctx, "sucesso", `Pedido #${id} excluído.`);
      return redirecionar("/admin/pedidos");
    }
  }

  throw new HttpErro(404);
}

// ---------------------------------------------------------------- entrada
function comSeguranca(resposta, extra = {}) {
  const res = new Response(resposta.body, resposta);
  for (const [k, v] of Object.entries({ ...CABECALHOS, ...extra })) res.headers.set(k, v);
  return res;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (!env.DB) throw new Error("Banco D1 não conectado (binding DB).");
      await prepararBanco(env.DB);

      // Imagens: rota separada, sem sessão/cookie, para o navegador poder guardar em cache
      let m;
      if (req.method === "GET" && (m = url.pathname.match(/^\/img\/(\d+)$/))) {
        return comSeguranca(await servirImagem(env, Number(m[1])), { "Content-Security-Policy": "default-src 'none'; sandbox" });
      }

      const sessao = await lerSessao(req, env);
      const ctx = { req, env, url, sessao, db: env.DB, ip: req.headers.get("CF-Connecting-IP") || "local" };
      let resposta;
      try {
        resposta = await rotear(ctx);
      } catch (e) {
        if (e instanceof Saida) resposta = e.resposta;
        else if (e instanceof HttpErro) resposta = paginaDeErro(ctx, e.codigo);
        else throw e;
      }
      resposta = comSeguranca(resposta);
      resposta.headers.append("Set-Cookie", await cookieSessao(ctx.sessao, env));
      resposta.headers.set("Cache-Control", "no-store");
      return resposta;
    } catch (e) {
      console.error("Erro:", e?.stack || e);
      const msg = String(e?.message || "").includes("SECRET_KEY") || String(e?.message || "").includes("D1")
        ? `Configuração incompleta: ${esc(e.message)}` : MENSAGENS[500];
      return comSeguranca(new Response(`<!DOCTYPE html><meta charset="utf-8"><title>Erro</title><p style="font-family:sans-serif;padding:2rem">${msg}</p>`,
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }));
    }
  },
};
