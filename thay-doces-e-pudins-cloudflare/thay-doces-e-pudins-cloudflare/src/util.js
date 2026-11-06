// Funções de apoio: HTML seguro, sessão assinada, validação, limites.

// ---------- HTML seguro (anti XSS): tudo é escapado, exceto o que vier de h`...` ----------
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function parte(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(parte).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(v);
}

/** Template: h`<p>${nome}</p>` — valores são escapados automaticamente. */
export function h(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += parte(v) + strings[i + 1]; });
  return new Raw(out);
}

// ---------- Formatação ----------
export const real = (v) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export function fone(n) {
  const d = String(n ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(n ?? "");
}

export function dataBR(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ---------- Criptografia (WebCrypto) ----------
const enc = new TextEncoder();

export function b64urlDeBytes(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function bytesDeB64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(chave, texto) {
  const k = await crypto.subtle.importKey("raw", enc.encode(chave),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

/** Compara textos em tempo constante (não vaza qual caractere errou). */
export async function textoIgual(a, b, segredo) {
  return iguais(await hmac(segredo, String(a)), await hmac(segredo, String(b)));
}

export function tokenAleatorio(bytes = 16) {
  return b64urlDeBytes(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---------- Sessão em cookie assinado ----------
const NOME_COOKIE = "sessao";
export const ADMIN_MINUTOS = 30;

export async function lerSessao(req, env) {
  if (!env.SECRET_KEY) throw new Error("SECRET_KEY não configurada nas variáveis da Cloudflare.");
  const cookies = Object.fromEntries((req.headers.get("Cookie") || "").split(/;\s*/).filter(Boolean)
    .map((c) => { const i = c.indexOf("="); return [c.slice(0, i), c.slice(i + 1)]; }));
  let dados = null;
  const bruto = cookies[NOME_COOKIE];
  if (bruto && bruto.includes(".")) {
    const [corpo, assin] = bruto.split(".");
    try {
      const esperado = await hmac(env.SECRET_KEY, corpo);
      if (iguais(esperado, bytesDeB64url(assin))) {
        dados = JSON.parse(new TextDecoder().decode(bytesDeB64url(corpo)));
      }
    } catch { dados = null; }
  }
  if (!dados || typeof dados !== "object") dados = {};
  if (!dados.csrf) dados.csrf = tokenAleatorio(16);
  if (typeof dados.carrinho !== "object" || dados.carrinho === null) dados.carrinho = {};
  if (!Array.isArray(dados.flash)) dados.flash = [];
  // Admin expira após 30 min sem uso
  if (dados.adminAte && Date.now() > dados.adminAte) delete dados.adminAte;
  return dados;
}

export async function cookieSessao(dados, env) {
  const corpo = b64urlDeBytes(enc.encode(JSON.stringify(dados)));
  const assin = b64urlDeBytes(await hmac(env.SECRET_KEY, corpo));
  return `${NOME_COOKIE}=${corpo}.${assin}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// ---------- Banco: criação das tabelas e limite de requisições ----------
let bancoPronto = null;

export function prepararBanco(db) {
  if (!bancoPronto) {
    bancoPronto = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS imagem (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, dados TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS produto (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, descricao TEXT NOT NULL,
        preco REAL NOT NULL, categoria TEXT NOT NULL, imagem_id INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, cliente TEXT NOT NULL,
        telefone TEXT NOT NULL, tipo TEXT NOT NULL, endereco TEXT, observacao TEXT,
        total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Novo', criado_em TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS item_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, produto_id INTEGER,
        nome TEXT NOT NULL, preco REAL NOT NULL, quantidade INTEGER NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS limite (
        chave TEXT PRIMARY KEY, expira INTEGER NOT NULL, n INTEGER NOT NULL)`),
    ]).catch((e) => { bancoPronto = null; throw e; });
  }
  return bancoPronto;
}

/** Retorna true se ainda está dentro do limite (máx. tentativas por janela, em segundos). */
export async function dentroDoLimite(db, chave, max, janelaSeg) {
  const agora = Math.floor(Date.now() / 1000);
  if (Math.random() < 0.02) {
    await db.prepare("DELETE FROM limite WHERE expira < ?").bind(agora).run();
  }
  await db.prepare(`INSERT INTO limite (chave, expira, n) VALUES (?, ?, 0)
                    ON CONFLICT(chave) DO UPDATE SET n = CASE WHEN expira < ? THEN 0 ELSE n END,
                    expira = CASE WHEN expira < ? THEN ? ELSE expira END`)
    .bind(chave, agora + janelaSeg, agora, agora, agora + janelaSeg).run();
  const r = await db.prepare("UPDATE limite SET n = n + 1 WHERE chave = ? RETURNING n")
    .bind(chave).first();
  return (r?.n ?? 1) <= max;
}

// ---------- Validação ----------
export const CATEGORIAS = ["Pudins", "Brigadeiros", "Bolos no pote", "Docinhos"];
export const STATUS_PEDIDO = ["Novo", "Em preparo", "Pronto", "Entregue", "Cancelado"];
export const TIPOS_ENTREGA = { retirada: "Retirar na loja", entrega: "Entrega" };
export const MAX_QTD_ITEM = 20;
export const MAX_ITENS_CARRINHO = 30;
export const MAX_IMAGEM_BYTES = 1024 * 1024; // 1 MB (o navegador já reduz antes de enviar)

const limpa = (s) => String(s ?? "").split(/\s+/).filter(Boolean).join(" ");

export function validarProduto(form) {
  const erros = [];
  const nome = limpa(form.get("nome"));
  const descricao = limpa(form.get("descricao"));
  const categoria = String(form.get("categoria") ?? "");
  const precoTxt = String(form.get("preco") ?? "").replace(",", ".").trim();
  if (nome.length < 2 || nome.length > 80) erros.push("O nome deve ter entre 2 e 80 caracteres.");
  if (descricao.length < 2 || descricao.length > 300) erros.push("A descrição deve ter entre 2 e 300 caracteres.");
  if (!CATEGORIAS.includes(categoria)) erros.push("Categoria inválida.");
  let preco = Number(precoTxt);
  if (!/^\d+(\.\d+)?$/.test(precoTxt) || !(preco > 0) || preco > 100000) {
    preco = null;
    erros.push("O preço deve ser um número positivo.");
  } else {
    preco = Math.round(preco * 100) / 100;
  }
  return { dados: { nome, descricao, categoria, preco }, erros };
}

export function validarPedido(form) {
  const erros = [];
  const cliente = limpa(form.get("cliente"));
  let telefone = String(form.get("telefone") ?? "").replace(/\D/g, "");
  const tipo = String(form.get("tipo") ?? "");
  let endereco = limpa(form.get("endereco"));
  const observacao = limpa(form.get("observacao"));
  if (cliente.length < 2 || cliente.length > 80) erros.push("Informe seu nome (2 a 80 caracteres).");
  if (telefone.startsWith("55") && telefone.length > 11) telefone = telefone.slice(2);
  if (telefone.length < 10 || telefone.length > 11) erros.push("Informe um telefone/WhatsApp válido com DDD.");
  if (!(tipo in TIPOS_ENTREGA)) erros.push("Escolha retirada ou entrega.");
  if (tipo === "entrega" && (endereco.length < 5 || endereco.length > 200)) erros.push("Informe o endereço de entrega (5 a 200 caracteres).");
  if (tipo !== "entrega") endereco = "";
  if (observacao.length > 300) erros.push("A observação pode ter no máximo 300 caracteres.");
  return { dados: { cliente, telefone, tipo: tipo in TIPOS_ENTREGA ? tipo : "retirada", endereco, observacao }, erros };
}

/** Confere o conteúdo real do arquivo (não confia na extensão). Retorna o tipo ou null. */
export function tipoDaImagem(bytes) {
  if (bytes.length > 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    const riff = String.fromCharCode(...bytes.slice(0, 4)), webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  return null;
}

export function enderecoSeguro(alvo, padrao) {
  return typeof alvo === "string" && alvo.startsWith("/") && !alvo.startsWith("//") && !alvo.includes("\\") ? alvo : padrao;
}
