# Evolução Impressos - Sistema de Orçamentos

Sistema web para cálculo de orçamentos de comunicação visual, desenvolvido com **React + Vite**, **Tailwind** e **Supabase**.

## Funcionalidades

- **Calculadora Inteligente**: cálculo de área (cm → m²) ou **linear (ml)** e aplicação automática de faixas de preço.
- **Gestão de Materiais**: cadastro de materiais com **valor mínimo**, descrição no orçamento, aviso de equivalência e **tabela de preços por faixa** (tiered pricing).
- **Autenticação**: login via Supabase Auth.
- **Permissões**: Admin x Consultor (tabela `profiles`).
- **Exportação**: botão para copiar um resumo formatado para WhatsApp.

---

## Configuração Inicial

### 1) Supabase

1. Crie um projeto no Supabase.
2. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_schema.sql`.
3. Crie seu usuário pelo **Auth** (ou pelo próprio app, se já estiver funcionando).
4. Rode o script `force_admin_by_email.sql` (ou `fix_admin_access.sql`) para definir seu usuário como **admin**.
5. Vá em **Project Settings → API** e copie:
   - `URL`
   - `anon public key`

### 2) Variáveis de ambiente

Crie um arquivo `.env` (use `.env.example` como base) e preencha:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

> Para **gestão de usuários** (criar/excluir) via **Vercel API**, configure também no painel da Vercel:

- `SUPABASE_URL` (pode ser a mesma do `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (NUNCA exponha essa chave no front-end)

### 3) Instalação e execução

```bash
npm install
npm run dev
```

---

## Deploy (Vercel)

1. Conecte seu repositório à Vercel.
2. Configure as variáveis de ambiente:
   - Front-end: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Serverless (API): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. O build é `npm run build` e o output é `dist/`.

> Rotas SPA já estão configuradas no `vercel.json`.

---

## Estrutura do Projeto

- `/src/pages`: telas do sistema (Home, Login, Materiais, Configurações).
- `/src/components`: componentes reutilizáveis (UI Shadcn).
- `/src/lib`: configuração do Supabase e utilitários.
- `/src/contexts`: contexto de autenticação e tema.
- `/api`: endpoints serverless da Vercel (ex: `api/admin-users.ts`).

