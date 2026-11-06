# 🍮 Thay Doces&Pudins — versão Cloudflare (grátis)

Site da loja com produtos, carrinho, pedidos e painel Admin protegido por senha.
Roda 100% na Cloudflare: **Workers** (o site) + **D1** (banco de dados). As imagens dos produtos ficam dentro do próprio banco D1, então não precisa de cartão nem de outros serviços.

## O que tem aqui

```
├── wrangler.toml      # configuração (você só troca o ID do banco)
├── package.json
├── src/
│   ├── index.js       # rotas e segurança
│   ├── views.js       # páginas
│   └── util.js        # funções de apoio
└── public/
    ├── css/estilo.css
    └── js/admin.js, pedido.js
```

Não existe arquivo `.env`: as senhas ficam guardadas no painel da Cloudflare (mais seguro).

---

## PASSO 1 — Subir para o GitHub

1. No GitHub, crie um repositório novo (pode ser **Private**), por exemplo `thay-doces-e-pudins`.
2. Clique em **uploading an existing file**.
3. Abra a pasta deste projeto no seu computador, selecione **tudo que está dentro dela** (`wrangler.toml`, `package.json`, `src`, `public`, `README.md`, `.gitignore`) e arraste para o GitHub.
   - Importante: o arquivo `wrangler.toml` precisa ficar na **raiz** do repositório, não dentro de uma subpasta.
4. Clique em **Commit changes**.

## PASSO 2 — Criar o banco de dados (D1)

1. Entre em **dash.cloudflare.com** (conta grátis).
2. No menu da esquerda: **Storage & Databases → D1 SQL Database → Create database**.
3. Nome: `thay-loja` → **Create**.
4. Na página do banco, copie o **Database ID** (um código comprido com letras, números e traços).
5. Volte ao GitHub, abra o arquivo `wrangler.toml`, clique no lápis (**Edit**) e troque `COLE-AQUI-O-ID-DO-BANCO` pelo código copiado (mantenha as aspas). **Commit changes**.

Não precisa criar tabelas: o site cria sozinho na primeira visita.

## PASSO 3 — Publicar o site

1. Na Cloudflare: **Workers & Pages → Create → Import a repository** (ou "Connect to Git").
2. Autorize o GitHub e escolha o repositório `thay-doces-e-pudins`.
3. Mantenha os comandos padrão (Deploy command: `npx wrangler deploy`) e clique em **Deploy**.
4. Quando terminar, a Cloudflare mostra o endereço do site (algo como `thay-doces-e-pudins.SEU-NOME.workers.dev`).

## PASSO 4 — Cadastrar a senha do Admin (obrigatório)

1. Abra o seu Worker na Cloudflare → **Settings → Variables and Secrets → Add**.
2. Tipo **Secret**, nome `SECRET_KEY`, valor: um texto longo e aleatório (40 letras e números misturados, sem sentido). **Guarde em lugar seguro.**
3. Adicione outro **Secret**: nome `ADMIN_PASSWORD`, valor: a senha que você quer para o painel (use uma senha forte e diferente das outras).
4. Clique em **Deploy** para aplicar.
5. O usuário do Admin é `thay` (para mudar, edite `ADMIN_USER` no `wrangler.toml`).

Até cadastrar o `SECRET_KEY`, o site mostra "Configuração incompleta". É normal.

## Usando o site

- **Clientes:** escolhem produtos, vão ao carrinho, finalizam informando nome, WhatsApp e retirada/entrega, e podem enviar o resumo pelo WhatsApp da loja.
- **Admin:** abra `/login` no endereço do site (ex.: `.../login`). Em **Produtos** você cadastra/edita/exclui com foto; em **Pedidos** vê cada pedido, muda o status (Novo, Em preparo, Pronto, Entregue, Cancelado) e exclui.
- O número de WhatsApp da loja está no `wrangler.toml` (`WHATSAPP_LOJA`).

## Atualizar o site depois

Altere o arquivo no GitHub (lápis → **Commit changes**). A Cloudflare publica a nova versão sozinha em poucos minutos.

## Segurança incluída

- Senha do Admin e chave de sessão só no painel da Cloudflare (nunca no código)
- Sessão em cookie assinado, HttpOnly, Secure e SameSite; Admin expira em 30 min sem uso
- Proteção CSRF em todos os formulários (exclusão/edição/saída só por POST)
- Limite de 5 tentativas de login por minuto e 10 pedidos por hora por IP
- Todo texto é escapado (anti XSS); consultas ao banco sempre com parâmetros (anti SQL Injection)
- CSP restritiva, X-Frame-Options, nosniff, Referrer-Policy, HSTS
- Upload: confere o conteúdo real da imagem, máximo de 1 MB (o navegador reduz a foto antes de enviar)
- Preço sempre lido do banco e congelado no pedido; link de confirmação com código aleatório
- Campo-isca contra robôs no formulário de pedido

## Limites do plano gratuito

O D1 grátis tem limite diário de leituras e escritas. Se um dia passar, o site mostra erro até meia-noite (UTC); os dados não são perdidos. Para uma loja pequena, é difícil chegar nisso. Confira os limites atuais e os termos de uso comercial no site da Cloudflare.

## Backup

No painel da Cloudflare, abra o banco `thay-loja` → **Export** (ou o console) de vez em quando para guardar uma cópia dos pedidos.

## Testar no computador (opcional)

Precisa do Node.js. Crie um arquivo `.dev.vars` com:
```
SECRET_KEY=qualquer-texto-longo-para-teste
ADMIN_PASSWORD=senha-de-teste
```
Depois rode `npm install` e `npm run dev`, e abra `http://localhost:8787`.
