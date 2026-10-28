# SweetFlow — Backend

API do **SweetFlow**, plataforma SaaS de gestão para confeitarias desenvolvida pela **Mastercode**.
Multi-tenant (uma base para várias confeitarias), com autenticação JWT, assinatura de planos, contrato com aceite eletrônico, pagamentos por três gateways e e-mail de confirmação com recibo em PDF.

> Repositório do frontend: `saas-conf-frontend` (React + Vite).

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Stack](#stack)
3. [Pré-requisitos](#pré-requisitos)
4. [Como rodar localmente](#como-rodar-localmente)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Scripts](#scripts)
7. [Arquitetura e estrutura de pastas](#arquitetura-e-estrutura-de-pastas)
8. [Multi-tenant e autenticação](#multi-tenant-e-autenticação)
9. [Endpoints da API](#endpoints-da-api)
10. [Assinatura, planos e contrato](#assinatura-planos-e-contrato)
11. [Pagamentos e webhooks](#pagamentos-e-webhooks)
12. [E-mail de confirmação e recibo](#e-mail-de-confirmação-e-recibo)
13. [Banco de dados e migrations](#banco-de-dados-e-migrations)
14. [Deploy no Render](#deploy-no-render)
15. [Testes](#testes)
16. [Solução de problemas](#solução-de-problemas)
17. [Segurança](#segurança)
18. [Licença](#licença)

---

## Funcionalidades

- Cadastro e login de confeitarias (tenants) e usuários, com perfis `admin`, `manager` e `staff`
- Painel do **Super Admin** da plataforma (confeitarias, planos, assinaturas, receita, logs de acesso)
- Clientes, produtos, categorias, pedidos, pagamentos, dashboard e auditoria
- Catálogo público por confeitaria, com login de clientes e checkout de pedidos
- Personalização visual (tema) do catálogo
- Integrações: Telegram, iFood e webhook do Zapier; IA via Groq/Anthropic (opcionais)
- **Assinatura SaaS** com planos, ciclos de cobrança e controle de limites por plano
- **Contrato** da Mastercode com aceite eletrônico registrado (IP, data/hora e versão)
- **Pagamentos:** Stripe, Mercado Pago (PIX transparente e cartão) e Pagar.me (Link de Pagamento)
- **E-mail de confirmação** de compra com recibo em PDF

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 (LTS) + TypeScript |
| Framework HTTP | Fastify 4 (`@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`) |
| Banco | MySQL (driver `mysql2`) |
| Validação | Zod |
| Senhas / tokens | bcrypt, JSON Web Token |
| Pagamentos | Stripe SDK, Mercado Pago SDK v2, API REST do Pagar.me v5 |
| E-mail / PDF | Nodemailer (SMTP) e PDFKit |
| Logs | Pino |

---

## Pré-requisitos

- **Node.js 20 ou 22 (LTS)** e npm. Evite o Node 24: algumas dependências (`fast-jwt`, `bcrypt`) ainda não o suportam oficialmente.
- Um banco **MySQL** acessível (local, Docker ou nuvem, como o Clever Cloud).
- Conta nos gateways que for usar (Stripe, Mercado Pago, Pagar.me) e um provedor SMTP para o e-mail.

---

## Como rodar localmente

```bash
# 1. instalar dependências
npm install

# 2. criar o arquivo de ambiente e preencher
cp .env.example .env        # no Windows: copy .env.example .env

# 3. subir em modo desenvolvimento
npm run dev
```

A API sobe em **http://localhost:3000**. Ao iniciar, o servidor:

1. conecta no banco (`testConnection`);
2. **executa as migrations pendentes** automaticamente;
3. executa o seed inicial **somente se o banco estiver vazio** e garante a existência do Super Admin.

Verificação rápida: `GET http://localhost:3000/health`.

> Se o banco estiver na nuvem e a conexão for recusada (`ECONNREFUSED`), a sua rede pode estar bloqueando a porta 3306 (firewall, VPN ou rede corporativa). Teste em outra rede.

### Build de produção

```bash
npm run build     # compila para dist/ e copia as migrations
npm start         # node dist/core/server.js
```

---

## Variáveis de ambiente

Modelo completo em `.env.example`. **Nunca versione o `.env`.**

**Aplicação**

| Variável | Descrição |
|---|---|
| `PORT` | Porta da API (padrão `3000`) |
| `NODE_ENV` | `development` ou `production` |
| `FRONTEND_URL` | URL do frontend (CORS e redirecionamentos de pagamento). Local: `http://localhost:5173` |
| `PUBLIC_API_URL` | URL pública deste backend, usada nos webhooks do Mercado Pago. Em localhost, deixe vazio. |

**Banco de dados**

| Variável | Descrição |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Credenciais do MySQL |
| `DB_SSL` | `true` para bancos em nuvem |

**Autenticação**

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | **Obrigatório em produção.** Chave longa e aleatória. Sem ela o sistema usa um valor padrão público e inseguro. |
| `JWT_EXPIRES_IN` | Validade do token de acesso (padrão `1d`) |
| `JWT_REFRESH_EXPIRES_IN` | Validade do refresh token (padrão `7d`) |

Para gerar um segredo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Gateways de pagamento** (preencha pelo menos um)

| Variável | Descrição |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe (`sk_...` e `whsec_...`) |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token da conta vendedora |
| `MERCADOPAGO_SELLER_EMAIL` | Opcional. E-mail da conta vendedora (se vazio, é consultado na API) |
| `PAGARME_API_KEY` | Secret Key do Pagar.me (`sk_...`) |
| `PAGARME_BASE_URL` | Opcional. Padrão `https://api.pagar.me/core/v5` |

**E-mail e dados da empresa (recibo)**

| Variável | Descrição |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor SMTP (Gmail com senha de app, Brevo, Resend etc.) |
| `MAIL_FROM` | Remetente exibido. O domínio precisa estar autenticado (SPF/DKIM) no provedor. |
| `COMPANY_NAME`, `COMPANY_CNPJ`, `COMPANY_ADDRESS`, `COMPANY_EMAIL` | Dados que aparecem no recibo |

**Integrações opcionais:** `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `ZAPIER_WEBHOOK_URL`, `SUPERADMIN_SETUP_KEY`, `IFOOD_INTEGRATION_MODE`, `IFOOD_MASTER_CLIENT_ID`, `IFOOD_MASTER_CLIENT_SECRET`.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento com recarregamento automático (`ts-node-dev`) |
| `npm run build` | Compila o TypeScript e copia as migrations para `dist/` |
| `npm start` | Executa a versão compilada |
| `npm run migrate` | Roda as migrations pendentes (usa o build em `dist/`) |
| `npm run seed` | Executa o seed (usa o build em `dist/`) |
| `npm run mail:test -- seu@email.com` | Envia um e-mail de confirmação **fictício** com recibo em PDF, para validar o SMTP |

---

## Arquitetura e estrutura de pastas

Monólito modular: cada domínio de negócio fica em `src/modules/<modulo>`, com rotas, serviço e acesso a dados próprios.

```
backend-render/
├── render.yaml                 # configuração do serviço no Render
├── .env.example
├── scripts/                    # utilitários (run-migrations.js)
├── tests/                      # e2e.sweetflow.test.ts, pagarme-422.test.ts
└── src/
    ├── core/
    │   ├── server.ts           # inicialização: banco, migrations, seed, listen
    │   └── app.ts              # plugins (CORS, JWT, rate-limit) e registro das rotas
    ├── config/                 # env.ts (variáveis), logger.ts
    ├── database/
    │   ├── connection.ts       # pool MySQL
    │   ├── migrate.ts          # executor de migrations
    │   ├── migrations/         # 001 ... 013 (SQL)
    │   └── seed.ts, runSeed.ts
    ├── middlewares/
    │   ├── auth.middleware.ts  # valida JWT e perfis (requireRole)
    │   └── tenant.middleware.ts# identifica a confeitaria da requisição
    ├── shared/
    │   ├── errors/             # AppError e tratador global de erros
    │   ├── utils/              # hash, jwt, validator
    │   └── webhooks/           # zapier
    ├── scripts/                # sendTestEmail.ts
    └── modules/
        ├── auth/               # login, cadastro, refresh, logout, troca de senha
        ├── tenants/  users/  clients/  products/  categories/  orders/
        ├── payments/           # pagamentos de pedidos + gateway.service (Stripe, Mercado Pago, Pagar.me)
        ├── subscriptions/      # assinatura SaaS: checkout, status, webhooks
        ├── contracts/          # versão e conteúdo do contrato
        ├── notifications/      # SMTP, e-mail de compra e recibo PDF
        ├── superadmin/         # painel da plataforma
        ├── catalog/  customer-auth/  theme/
        ├── dashboard/  audit/  health/
        └── integrations/ telegram/   # iFood, Telegram
```

Os módulos seguem, em geral, a divisão `*.routes.ts` (endpoints) → `*.service.ts` (regras) → `*.repository.ts` (SQL), com `*.schema.ts` quando há validação Zod.

---

## Multi-tenant e autenticação

**Tenant.** Cada confeitaria é um *tenant*. Rotas autenticadas e de catálogo precisam identificá-lo por um dos cabeçalhos:

- `X-Tenant-Slug: <slug>` ou
- `X-Tenant-ID: <id>`

Sem isso a API responde `400 Tenant não identificado`.

**Autenticação.** Login em `POST /api/auth/login` devolve `accessToken` e `refreshToken`. Envie `Authorization: Bearer <accessToken>` nas rotas protegidas. O `refreshToken` renova a sessão em `POST /api/auth/refresh`.

**Perfis:** `admin`, `manager` e `staff` (por confeitaria), além do **Super Admin** da plataforma, com login próprio em `POST /api/auth/superadmin/login`.

**Proteções:** rate limiting global, senhas com bcrypt, validação de entrada com Zod e CORS restrito ao `FRONTEND_URL`.

---

## Endpoints da API

Prefixos registrados em `src/core/app.ts`:

| Prefixo | Descrição |
|---|---|
| `/health` | Verificação de saúde |
| `/api/auth` | `login`, `register`, `refresh`, `logout`, `me`, `change-password`, `superadmin/login` |
| `/api/tenants`, `/api/users` | Confeitarias e usuários |
| `/api/clients`, `/api/products`, `/api/categories` | Cadastros |
| `/api/orders`, `/api/payments` | Pedidos e pagamentos |
| `/api/dashboard`, `/api/audit` | Indicadores e auditoria |
| `/api/settings/theme` | Tema do catálogo |
| `/api/public` | Catálogo público e autenticação de clientes finais |
| `/api/checkout` | Checkout dos pedidos do catálogo: `stripe`, `mercadopago`, `pagarme` e `status` |
| `/api/subscriptions` | Assinatura SaaS (detalhes abaixo) |
| `/api/superadmin` | Painel da plataforma |
| `/api/integrations/ifood`, `/api/telegram` | Integrações |

**Assinatura (`/api/subscriptions`)**

| Método e rota | Acesso | Função |
|---|---|---|
| `POST /checkout` | admin | Cria a cobrança do plano no gateway escolhido |
| `GET /status` | autenticado | Situação da assinatura do tenant |
| `GET /mercadopago/payment/:paymentId` | autenticado | Consulta o pagamento no Mercado Pago e ativa o plano se aprovado |
| `POST /webhook/stripe` | público (assinado) | Confirmação de pagamento Stripe |
| `POST /webhook/mercadopago` | público | Confirmação de pagamento Mercado Pago |
| `POST /webhook/pagarme` | público | Confirmação de pagamento Pagar.me |

**Super Admin (`/api/superadmin`):** `revenue`, `tenants`, `tenants/:id` (plano, status, reset de senha), `subscriptions`, `access-logs` e `setup`.

---

## Assinatura, planos e contrato

**Planos**

| Plano | Mensalidade | Limites |
|---|---|---|
| Econômico | R$ 49,90 | 1 usuário, 30 produtos, 50 pedidos/mês |
| Standard | R$ 99,90 | 5 usuários, 200 produtos, 300 pedidos/mês |
| Premium | R$ 199,90 | ilimitado |

**Ciclos:** mensal (sem fidelidade), 12, 24 e 36 meses, com 10%, 15% e 20% de desconto. Os valores ficam em `subscription.repository.ts`.

**Parcelamento (cartão):** plano mensal à vista; ciclos longos permitem até 12x. O ajuste está em `subscription.routes.ts` (`maxInstallments`).

**Fluxo**

1. O frontend registra o **aceite do contrato** (tabela `contract_acceptances`: tenant, versão, IP, navegador, data/hora).
2. `POST /api/subscriptions/checkout` cria a cobrança e uma assinatura **pendente**.
3. O gateway confirma o pagamento (webhook ou consulta ativa).
4. `markSubscriptionPaid` ativa a assinatura, define as datas e aplica os limites do plano.
5. Dispara o e-mail de confirmação com recibo (uma única vez por assinatura).

**Contrato.** A versão vigente é `CONTRACT_VERSION` em `src/modules/contracts/contract.content.ts` e **deve ser igual** à do frontend (`saasContract.ts`).

---

## Pagamentos e webhooks

Toda a integração com os gateways está em `src/modules/payments/gateway.service.ts`.

**Stripe.** Checkout Session com cartão.

**Mercado Pago**
- **PIX transparente:** pagamento criado direto pela API (`payment_method_id: pix`). O backend devolve o QR Code e o "copia e cola".
- **Cartão:** Checkout Pro restrito a cartão (exclui boleto e PIX), sem `auto_return`.
- **Auto-venda:** o Mercado Pago bloqueia a compra quando o e-mail do pagador é o da conta vendedora. O sistema substitui automaticamente por um e-mail alternativo.
- **CPF/CNPJ:** só é enviado se for matematicamente válido (evita o erro 2067).

**Pagar.me v5.** Link de Pagamento (`POST /paymentlinks`) com `credit_card_settings` (tabela de parcelas) e `pix_settings`. **Não use** `/orders` com `payment_method: "checkout"`: ele retorna *"The checkout payment method is not available for this account"*. O cliente só é pré-preenchido quando há CPF/CNPJ válidos.

**Webhooks a cadastrar nos painéis dos gateways** (troque pelo domínio do seu backend):

| Gateway | URL | Eventos |
|---|---|---|
| Stripe | `https://SEU-BACKEND/api/subscriptions/webhook/stripe` | `checkout.session.completed` |
| Mercado Pago | `https://SEU-BACKEND/api/subscriptions/webhook/mercadopago` | Pagamentos |
| Pagar.me | `https://SEU-BACKEND/api/subscriptions/webhook/pagarme` | `order.paid`, `order.payment_failed`, `order.canceled` |

**Teste local sem webhook.** Em `localhost` os gateways não alcançam o seu computador. Para o PIX do Mercado Pago isso não é problema, porque o frontend consulta `GET /subscriptions/mercadopago/payment/:id` a cada 5 segundos. Para Stripe e Pagar.me, use um túnel (ex.: ngrok) ou teste direto no Render.

**Diagnóstico.** `GET /api/checkout/status` (exige tenant e login) mostra quais chaves de gateway foram lidas pelo servidor.

---

## E-mail de confirmação e recibo

Código em `src/modules/notifications`.

- Disparado quando o pagamento é confirmado. **Nunca derruba o webhook:** falhas aparecem só no log.
- Envia **uma única vez** por assinatura (coluna `confirmation_email_sent_at`, migration 013).
- Conteúdo: ID do pedido e da assinatura, gateway, data, valor, plano, ciclo, desconto, vigência, recursos, versão do contrato aceito, prazo de arrependimento (7 dias) e multa de fidelidade.
- Anexo: **recibo em PDF**, identificado como *comprovante sem valor fiscal*.
- O recibo **não substitui a nota fiscal**. A emissão fiscal (NFS-e) exige CNPJ, regime tributário e certificado digital da Mastercode e ainda não está integrada.

**Testar o SMTP sem pagar:** `npm run mail:test -- seu@email.com`.

**Gmail para testes:** ative a verificação em duas etapas, crie uma **senha de app** e use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587` e a senha de app em `SMTP_PASS`. Para produção, prefira um provedor transacional (Brevo, Resend) com domínio autenticado.

---

## Banco de dados e migrations

Arquivos SQL numerados em `src/database/migrations`. O servidor aplica as pendentes ao iniciar, e o controle de quais já rodaram é feito pelo executor (`migrate.ts`).

| Migration | Conteúdo |
|---|---|
| 001 | Esquema inicial (tenants, usuários, clientes, produtos, pedidos...) |
| 002 | Tema e catálogo |
| 003 | Integrações |
| 004 | Seed de categorias |
| 005 | Ampliação da URL de imagem do produto |
| 006 | Banner e "sobre" do catálogo |
| 007 | Autenticação de clientes |
| 008 | Método de pagamento do pedido |
| 009 | Plano e segurança |
| 010 | Assinaturas e Super Admin |
| 011 | Logs de acesso |
| 012 | Contrato e checkout da assinatura |
| 013 | Controle do e-mail de confirmação |

Para criar uma nova migration, adicione `0NN_descricao.sql` na pasta (próximo número da sequência) e reinicie o servidor.

---

## Deploy no Render

A configuração está no `render.yaml`.

- **Build:** `npm install && npm run build && npm run migrate`
- **Start:** `npm start`
- **Health check:** `/health`
- **Node:** variável `NODE_VERSION=22`

Passo a passo:

1. Crie um **Web Service** no Render ligado ao repositório.
2. Em **Environment**, preencha as variáveis marcadas como `sync: false` (banco, gateways, SMTP, `FRONTEND_URL`, `PUBLIC_API_URL`, dados da empresa). O `JWT_SECRET` é gerado automaticamente.
3. Faça o deploy e confirme `https://SEU-BACKEND/health`.
4. Cadastre os **webhooks** dos gateways (seção acima).
5. No frontend, defina `VITE_API_URL` com a URL deste serviço, **sem `/api` no final**.

**Dependências no build.** O `package.json` e o `package-lock.json` devem ser commitados **juntos**. Se o build falhar com `Cannot find module 'nodemailer'` ou `'pdfkit'`, o repositório está com um `package.json` antigo, sem essas bibliotecas e seus tipos (`@types/nodemailer`, `@types/pdfkit`).

---

## Testes

A pasta `tests/` contém `e2e.sweetflow.test.ts` (fluxo ponta a ponta) e `pagarme-422.test.ts` (cenário de erro do Pagar.me). Ainda não há um script `npm test` configurado.

---

## Solução de problemas

| Sintoma | Causa provável e solução |
|---|---|
| `ECONNREFUSED` ao conectar no banco | A rede bloqueia a porta 3306, ou o banco está suspenso. Teste em outra rede e confira o painel do provedor. |
| `Tenant não identificado` | Falta o cabeçalho `X-Tenant-Slug` ou `X-Tenant-ID`. |
| `Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN)` | Variável ausente **no ambiente em que o backend está rodando**. Defina e **reinicie** (o `.env` só é lido ao iniciar). |
| `Pagar.me não configurado` | Mesma situação, para `PAGARME_API_KEY`. |
| Pagar.me: *checkout payment method is not available* | Está usando `/orders` com `checkout`. O correto é `/paymentlinks`. |
| Pagar.me: erros de `Credit Card Settings` / `Pix Settings` | Faltam `credit_card_settings` e `pix_settings`. Não envie `installments` junto com `installments_setup`. |
| Mercado Pago: PIX não gera código | A conta vendedora precisa de chave PIX, e o pagador não pode ser a própria conta vendedora. |
| Pagamento aprovado e plano não ativa | O webhook não chegou. Confira a URL cadastrada no gateway e `PUBLIC_API_URL`. |
| E-mail não chega | Confira `SMTP_*`, rode `npm run mail:test` e veja a pasta de spam. |
| Erro com `bcrypt` ao instalar | Use Node 20 ou 22. No npm 11, rode `npm install-scripts approve bcrypt` e `npm rebuild bcrypt`. |
| `Cannot find module 'nodemailer'`/`'pdfkit'` no Render | `package.json` do repositório desatualizado. Veja a seção de deploy. |

---

## Segurança

- **Nunca versione o `.env`** nem coloque valores reais no `.env.example`.
- Defina um `JWT_SECRET` forte em produção. Sem ele, o sistema cai num valor padrão público.
- Se uma chave real for commitada, **revogue e gere outra imediatamente**. Remover o arquivo não limpa o histórico do Git.
- Mantenha as chaves dos gateways **somente** no backend. Nunca em variáveis `VITE_*` do frontend.
- Use as credenciais de **teste** dos gateways em desenvolvimento. Credenciais de produção cobram de verdade.
- Rode `npm audit` periodicamente e evite `npm audit fix --force` sem revisar as mudanças.

---

## Licença

A definir pelo proprietário do projeto. © Mastercode.
