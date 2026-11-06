// Páginas HTML do site (todo texto de usuário é escapado por h``).
import { h, raw, real, fone, dataBR, CATEGORIAS, TIPOS_ENTREGA } from "./util.js";

const csrfInput = (csrf) => h`<input type="hidden" name="csrf_token" value="${csrf}">`;
const imgUrl = (p) => (p.imagem_id ? `/img/${p.imagem_id}` : null);

export function layout({ titulo = "Thay Doces&Pudins", corpo, qtd = 0, flash = [], scripts = [] }) {
  return h`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titulo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Pacifico&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/estilo.css">
</head>
<body>
  <header class="topo">
    <a class="logo" href="/">🍮 Thay Doces&amp;Pudins</a>
    <nav>
      <a href="/">Início</a>
      <a href="/produtos">Produtos</a>
      <a href="/carrinho">🛒 Carrinho${qtd ? h` <span class="contador">${qtd}</span>` : ""}</a>
      <a href="/admin">Admin</a>
    </nav>
  </header>
  <main class="conteudo">
    ${flash.map(([cat, msg]) => h`<div class="flash ${cat === "erro" ? "flash-erro" : "flash-sucesso"}">${msg}</div>`)}
    ${corpo}
  </main>
  <footer class="rodape">© Thay Doces&amp;Pudins — feito com carinho 💖</footer>
  ${scripts.map((s) => h`<script src="${s}"></script>`)}
</body>
</html>`;
}

export function card(p, csrf, voltar) {
  const img = imgUrl(p);
  return h`<article class="card">
  ${img ? h`<img src="${img}" alt="${p.nome}" loading="lazy">` : h`<div class="sem-imagem">🍮</div>`}
  <div class="card-corpo">
    <span class="tag">${p.categoria}</span>
    <h3>${p.nome}</h3>
    <p>${p.descricao}</p>
    <strong class="preco">${real(p.preco)}</strong>
    <form method="post" action="/carrinho/adicionar/${p.id}" class="form-card">
      ${csrfInput(csrf)}
      <input type="hidden" name="voltar" value="${voltar}">
      <button class="botao botao-pequeno" type="submit">🛒 Adicionar</button>
    </form>
  </div>
</article>`;
}

export function paginaInicio(destaques, csrf) {
  return h`<section class="banner">
  <h1>Thay Doces&amp;Pudins</h1>
  <p>Doces feitos com amor para adoçar o seu dia 💖</p>
  <a class="botao" href="/produtos">Ver produtos</a>
</section>
<h2 class="titulo-secao">Destaques</h2>
${destaques.length
    ? h`<div class="grade">${destaques.map((p) => card(p, csrf, "/"))}</div>`
    : h`<p class="vazio">Em breve novos docinhos por aqui! 🍬</p>`}`;
}

export function paginaProdutos(produtos, ativa, csrf) {
  const voltar = ativa ? `/produtos?categoria=${encodeURIComponent(ativa)}` : "/produtos";
  return h`<h2 class="titulo-secao">Nossos produtos</h2>
<div class="filtros">
  <a class="chip ${!ativa ? "ativo" : ""}" href="/produtos">Todos</a>
  ${CATEGORIAS.map((c) => h`<a class="chip ${ativa === c ? "ativo" : ""}" href="/produtos?categoria=${encodeURIComponent(c)}">${c}</a>`)}
</div>
${produtos.length
    ? h`<div class="grade">${produtos.map((p) => card(p, csrf, voltar))}</div>`
    : h`<p class="vazio">Nenhum produto nesta categoria ainda. 🍬</p>`}`;
}

export function paginaCarrinho(itens, total, csrf) {
  if (!itens.length) {
    return h`<h2 class="titulo-secao">Seu carrinho 🛒</h2>
<p class="vazio">Seu carrinho está vazio. 🍬</p>
<p class="vazio"><a class="botao" href="/produtos">Ver produtos</a></p>`;
  }
  return h`<h2 class="titulo-secao">Seu carrinho 🛒</h2>
<div class="lista-admin">
  ${itens.map(({ p, qtd, sub }) => h`<div class="item-admin">
    ${imgUrl(p) ? h`<img src="${imgUrl(p)}" alt="${p.nome}">` : h`<div class="sem-imagem mini">🍮</div>`}
    <div class="info"><strong>${p.nome}</strong><span>${real(p.preco)} cada</span></div>
    <form method="post" action="/carrinho/atualizar/${p.id}" class="form-qtd">
      ${csrfInput(csrf)}
      <input type="number" name="quantidade" value="${qtd}" min="0" max="20" aria-label="Quantidade de ${p.nome}">
      <button class="botao botao-pequeno botao-contorno" type="submit">Atualizar</button>
    </form>
    <strong class="preco">${real(sub)}</strong>
    <form method="post" action="/carrinho/remover/${p.id}" class="form-excluir">
      ${csrfInput(csrf)}
      <button class="botao botao-pequeno botao-perigo" type="submit">Remover</button>
    </form>
  </div>`)}
</div>
<div class="total-linha"><span>Total</span> <strong class="preco">${real(total)}</strong></div>
<div class="acoes">
  <a class="botao botao-contorno" href="/produtos">Continuar comprando</a>
  <a class="botao" href="/finalizar">Finalizar pedido</a>
</div>`;
}

export function paginaFinalizar(itens, total, dados, csrf) {
  return h`<h2 class="titulo-secao">Finalizar pedido</h2>
<section class="caixa">
  <h3>Resumo</h3>
  <ul class="resumo">${itens.map(({ p, qtd, sub }) => h`<li><span>${qtd}x ${p.nome}</span> <span>${real(sub)}</span></li>`)}</ul>
  <div class="total-linha"><span>Total</span> <strong class="preco">${real(total)}</strong></div>
</section>
<section class="caixa">
  <h3>Seus dados</h3>
  <form method="post" action="/finalizar">
    ${csrfInput(csrf)}
    <div class="isca" aria-hidden="true"><label>Não preencha <input type="text" name="campo_extra" tabindex="-1" autocomplete="off"></label></div>
    <label>Nome
      <input type="text" name="cliente" required minlength="2" maxlength="80" value="${dados.cliente}">
    </label>
    <label>WhatsApp / Telefone (com DDD)
      <input type="text" name="telefone" required inputmode="tel" maxlength="20" placeholder="(11) 99999-9999" value="${dados.telefone}">
    </label>
    <label>Como você prefere receber?
      <select name="tipo" id="tipo" required>
        ${Object.entries(TIPOS_ENTREGA).map(([k, nome]) => h`<option value="${k}" ${dados.tipo === k ? "selected" : ""}>${nome}</option>`)}
      </select>
    </label>
    <label id="campo-endereco">Endereço de entrega
      <input type="text" name="endereco" id="endereco" maxlength="200" placeholder="Rua, número, bairro (só para entrega)" value="${dados.endereco}">
    </label>
    <label>Observação (opcional)
      <textarea name="observacao" rows="3" maxlength="300">${dados.observacao}</textarea>
    </label>
    <div class="acoes">
      <a class="botao botao-contorno" href="/carrinho">Voltar ao carrinho</a>
      <button class="botao" type="submit">Enviar pedido</button>
    </div>
  </form>
</section>`;
}

export function paginaConfirmado(pedido, itens, whatsappUrl) {
  return h`<section class="banner">
  <h1>Pedido recebido! 🎉</h1>
  <p>Obrigada, ${pedido.cliente}! Seu pedido <strong>#${pedido.id}</strong> foi registrado.</p>
</section>
<section class="caixa">
  <h3>Resumo do pedido</h3>
  <ul class="resumo">${itens.map((i) => h`<li><span>${i.quantidade}x ${i.nome}</span> <span>${real(i.preco * i.quantidade)}</span></li>`)}</ul>
  <div class="total-linha"><span>Total</span> <strong class="preco">${real(pedido.total)}</strong></div>
  <p><strong>${pedido.tipo === "entrega" ? "Entrega" : "Retirada na loja"}</strong>${pedido.endereco ? h` — ${pedido.endereco}` : ""}</p>
  ${pedido.observacao ? h`<p>Observação: ${pedido.observacao}</p>` : ""}
  <p>Para agilizar, envie o resumo para a loja pelo WhatsApp:</p>
  <div class="acoes">
    <a class="botao" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp 💬</a>
    <a class="botao botao-contorno" href="/produtos">Voltar aos produtos</a>
  </div>
</section>`;
}

export function paginaLogin(csrf) {
  return h`<section class="caixa caixa-pequena">
  <h2 class="titulo-secao">Login do Admin</h2>
  <form method="post" action="/login" autocomplete="off">
    ${csrfInput(csrf)}
    <label>Usuário <input type="text" name="usuario" required maxlength="50"></label>
    <label>Senha <input type="password" name="senha" required maxlength="128"></label>
    <button class="botao" type="submit">Entrar</button>
  </form>
</section>`;
}

const topoAdmin = (csrf, aba) => h`<div class="admin-topo">
  <h2 class="titulo-secao">Painel Admin</h2>
  <form method="post" action="/logout">${csrfInput(csrf)}<button class="botao botao-contorno" type="submit">Sair</button></form>
</div>
<nav class="abas-admin">
  <a class="chip ${aba === "produtos" ? "ativo" : ""}" href="/admin">Produtos</a>
  <a class="chip ${aba === "pedidos" ? "ativo" : ""}" href="/admin/pedidos">Pedidos</a>
</nav>`;

export function paginaAdmin(produtos, produto, csrf) {
  const editando = !!produto;
  return h`${topoAdmin(csrf, "produtos")}
<section class="caixa">
  <h3>${editando ? "Editar produto" : "Cadastrar produto"}</h3>
  <form method="post" enctype="multipart/form-data" id="form-produto"
        action="${editando ? `/admin/editar/${produto.id}` : "/admin/cadastrar"}">
    ${csrfInput(csrf)}
    <label>Nome
      <input type="text" name="nome" required minlength="2" maxlength="80" value="${produto?.nome ?? ""}">
    </label>
    <label>Descrição
      <textarea name="descricao" required minlength="2" maxlength="300" rows="3">${produto?.descricao ?? ""}</textarea>
    </label>
    <div class="linha">
      <label>Preço (R$)
        <input type="number" name="preco" required min="0.01" step="0.01" value="${produto?.preco ?? ""}">
      </label>
      <label>Categoria
        <select name="categoria" required>
          ${CATEGORIAS.map((c) => h`<option value="${c}" ${produto?.categoria === c ? "selected" : ""}>${c}</option>`)}
        </select>
      </label>
    </div>
    <label>Imagem ${editando ? "(deixe vazio para manter a atual)" : ""}
      <input type="file" id="imagem" name="imagem" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp">
    </label>
    <img id="previa" class="previa" ${produto && imgUrl(produto) ? raw(`src="${imgUrl(produto)}"`) : raw("hidden")} alt="Pré-visualização da imagem">
    <div class="acoes">
      <button class="botao" type="submit">${editando ? "Salvar alterações" : "Cadastrar"}</button>
      ${editando ? h`<a class="botao botao-contorno" href="/admin">Cancelar</a>` : ""}
    </div>
  </form>
</section>
<h3 class="titulo-secao">Produtos cadastrados</h3>
${produtos.length
    ? h`<div class="lista-admin">${produtos.map((p) => h`<div class="item-admin">
    ${imgUrl(p) ? h`<img src="${imgUrl(p)}" alt="${p.nome}">` : h`<div class="sem-imagem mini">🍮</div>`}
    <div class="info"><strong>${p.nome}</strong><span>${p.categoria} · ${real(p.preco)}</span></div>
    <div class="acoes">
      <a class="botao botao-pequeno" href="/admin/editar/${p.id}">Editar</a>
      <form method="post" action="/admin/excluir/${p.id}" class="form-excluir">
        ${csrfInput(csrf)}<button class="botao botao-pequeno botao-perigo" type="submit">Excluir</button>
      </form>
    </div>
  </div>`)}</div>`
    : h`<p class="vazio">Nenhum produto cadastrado ainda.</p>`}`;
}

export function paginaPedidos(pedidos, itensPorPedido, filtro, statusLista, csrf) {
  return h`${topoAdmin(csrf, "pedidos")}
<div class="filtros">
  <a class="chip ${!filtro ? "ativo" : ""}" href="/admin/pedidos">Todos</a>
  ${statusLista.map((s) => h`<a class="chip ${filtro === s ? "ativo" : ""}" href="/admin/pedidos?status=${encodeURIComponent(s)}">${s}</a>`)}
</div>
${pedidos.length ? pedidos.map((p) => h`<article class="caixa pedido">
  <div class="pedido-topo">
    <h3>Pedido #${p.id}</h3>
    <span class="tag status-${p.status.replace(/ /g, "-").toLowerCase()}">${p.status}</span>
    <span class="data">${dataBR(p.criado_em)}</span>
  </div>
  <p><strong>${p.cliente}</strong> · <a href="https://wa.me/55${p.telefone}" target="_blank" rel="noopener noreferrer">${fone(p.telefone)}</a></p>
  <p>${TIPOS_ENTREGA[p.tipo] ?? p.tipo}${p.endereco ? h` — ${p.endereco}` : ""}</p>
  ${p.observacao ? h`<p>Obs.: ${p.observacao}</p>` : ""}
  <ul class="resumo">${(itensPorPedido[p.id] || []).map((i) => h`<li><span>${i.quantidade}x ${i.nome}</span> <span>${real(i.preco * i.quantidade)}</span></li>`)}</ul>
  <div class="total-linha"><span>Total</span> <strong class="preco">${real(p.total)}</strong></div>
  <div class="acoes">
    <form method="post" action="/admin/pedidos/${p.id}/status" class="form-status">
      ${csrfInput(csrf)}
      <input type="hidden" name="filtro" value="${filtro}">
      <select name="status" aria-label="Status do pedido ${p.id}">
        ${statusLista.map((s) => h`<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`)}
      </select>
      <button class="botao botao-pequeno" type="submit">Atualizar status</button>
    </form>
    <form method="post" action="/admin/pedidos/${p.id}/excluir" class="form-excluir-pedido">
      ${csrfInput(csrf)}<button class="botao botao-pequeno botao-perigo" type="submit">Excluir</button>
    </form>
  </div>
</article>`) : h`<p class="vazio">Nenhum pedido por aqui ainda. 🍬</p>`}`;
}

export function paginaErro(codigo, mensagem) {
  return h`<section class="banner">
  <h1>${codigo}</h1>
  <p>${mensagem}</p>
  <a class="botao" href="/">Voltar ao início</a>
</section>`;
}
