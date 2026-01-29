# Evolução - Comunicação Visual - Sistema de Orçamentos

Sistema web para cálculo de orçamentos de comunicação visual, desenvolvido com **React + Vite**, **Tailwind** e **Supabase**.

## Funcionalidades

- **Calculadora Inteligente**: cálculo de área (cm → m²) ou **linear (ml)** e aplicação automática de faixas de preço.
- **Gestão de Materiais**: cadastro de materiais com **valor mínimo**, descrição no orçamento, aviso de equivalência e **tabela de preços por faixa** (tiered pricing).
- **Autenticação**: login via Supabase Auth.
- **Permissões**: Admin x Consultor (tabela `profiles`).
- **Exportação**: botão para copiar um resumo formatado para WhatsApp.
- **Hub OS**: criação e acompanhamento de Ordens de Serviço com Kanban, detalhes, comprovantes e auditoria.

---

## Configuração Inicial

### 1) Supabase

1. Crie um projeto no Supabase.
2. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_schema.sql`.
3. Para habilitar o Hub OS, execute também os SQLs em `supabase/migrations/20250308_hub_os.sql`, `supabase/migrations/20250310_hub_os_dual_boards.sql` e `supabase/migrations/20250312_conta_azul.sql`.
4. Crie seu usuário pelo **Auth** (ou pelo próprio app, se já estiver funcionando).
5. Rode o script `force_admin_by_email.sql` (ou `fix_admin_access.sql`) para definir seu usuário como **admin**.
6. Vá em **Project Settings → API** e copie:
   - `URL`
   - `anon public key`

### 2) Variáveis de ambiente

Crie um arquivo `.env` (use `.env.example` como base) e preencha:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_OS_FOLDER_BASE=\\\\servidor-pc\\...\\A_Z
```

> Para **gestão de usuários** (criar/excluir) via **Vercel API**, configure também no painel da Vercel:

- `SUPABASE_URL` (pode ser a mesma do `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (NUNCA exponha essa chave no front-end)
- `ADMIN_FUNCTION_TOKEN` (token interno para rotas administrativas)
- `CONTA_AZUL_CLIENT_ID`
- `CONTA_AZUL_CLIENT_SECRET`
- `CONTA_AZUL_REDIRECT_URI` (opcional; será inferida caso não exista)
- `CONTA_AZUL_SCOPES` (opcional)
- `CONTA_AZUL_CRON_SECRET`

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

### Agendamento Conta Azul (Supabase)

No plano Hobby da Vercel, o cron não roda a cada poucos minutos. Para o polling da Conta Azul, use o scheduler do Supabase.

1. Ative as extensões **pg_cron** e **pg_net** no Supabase.
2. No Vault do Supabase, crie:
   - `vercel_sync_url` (ex: `https://SEU-DOMINIO.vercel.app/api/conta-azul/sync`)
   - `cron_secret` (o mesmo `CONTA_AZUL_CRON_SECRET`)
3. Execute o SQL `supabase/conta_azul_cron.sql` para criar o agendamento.

Para sincronização manual via UI (admin), o botão usa o endpoint `/api/conta-azul/sync-admin` com autenticação do Supabase.

---

## Estrutura do Projeto

- `/src/pages`: telas do sistema (Home, Login, Materiais, Configurações).
- `/src/components`: componentes reutilizáveis (UI Shadcn).
- `/src/lib`: configuração do Supabase e utilitários.
- `/src/contexts`: contexto de autenticação e tema.
- `/src/modules/hub-os`: módulo Hub OS (Kanban, detalhe, gateway financeiro, utilitários).
- `/src/integrations`: stubs para integrações futuras (Conta Azul, Digisac).
- `/api`: endpoints serverless da Vercel (ex: `api/admin-users.ts`).

---

## Hub OS (Ordens de Serviço)

### Storage (Supabase)

Crie o bucket **`comprovantes-os`** no Supabase Storage para armazenar anexos de comprovantes.

Os uploads serão salvos no formato:

```
/os/{os_id}/{timestamp}-{filename}
```

Se você preferir URLs privadas, ajuste o método de geração de URL no módulo `src/modules/hub-os`.
