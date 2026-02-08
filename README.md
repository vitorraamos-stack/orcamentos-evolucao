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
3. Para habilitar o Hub OS, execute também os SQLs em `supabase/migrations/20250308_hub_os.sql` e `supabase/migrations/20250310_hub_os_dual_boards.sql`.
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

## Estrutura do Projeto

- `/src/pages`: telas do sistema (Home, Login, Materiais, Configurações).
- `/src/components`: componentes reutilizáveis (UI Shadcn).
- `/src/lib`: configuração do Supabase e utilitários.
- `/src/contexts`: contexto de autenticação e tema.
- `/src/modules/hub-os`: módulo Hub OS (Kanban, detalhe, gateway financeiro, utilitários).
- `/src/integrations`: stubs para integrações futuras (Digisac).
- `/api`: endpoints serverless da Vercel (ex: `api/admin-users.ts`).

---

## Hub OS (Ordens de Serviço)

### Storage

Os arquivos de artes/referências são enviados para o **Cloudflare R2** (bucket `os-artes`), com upload direto do browser via URL pré-assinada. As chaves seguem o padrão:

```
os_orders/{os_id}/{job_id}/{timestamp}_{filename}
```

Os comprovantes de pagamento também ficam no R2 e seguem o padrão:

```
os_orders/{os_id}/payment_proofs/{payment_proof_id}/Financeiro/Comprovante/{timestamp}-{filename}
```

### Agent de Artes/Referências (Windows)

O agente roda na rede local para copiar os arquivos do R2 (ou Supabase Storage para registros antigos) para o SMB e limpar o storage após confirmar. Comprovantes são sincronizados para:

```
<folder_path>\Financeiro\Comprovante
```

1. Variáveis de ambiente necessárias:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OS_ASSET_BUCKET=os-artes
SMB_BASE=\\\\filesrv\\A_Z
POLL_INTERVAL_SECONDS=10
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=os-artes
# R2_ENDPOINT opcional (default: https://<ACCOUNT_ID>.r2.cloudflarestorage.com)
```

2. Instalação e execução:

```bash
cd tools/os-asset-agent
npm install
npm run start
```

### Cloudflare R2

1. Crie um bucket no Cloudflare R2 (ex: `os-artes`).
2. Crie uma **Access Key (S3 API)** e guarde as credenciais em segurança.
3. Configure o CORS do bucket para permitir upload direto do browser (incluindo leitura do `ETag` após `PUT`). JSON recomendado:

```json
[
  {
    "AllowedOrigins": [
      "https://seu-projeto.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

4. Configure as variáveis de ambiente das Edge Functions (Supabase):

```bash
supabase secrets set \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=os-artes
```

5. Publique as funções:

```bash
supabase functions deploy r2-presign-upload
supabase functions deploy r2-presign-download
supabase functions deploy r2-delete-objects
supabase functions deploy r2-health
```

> As funções exigem usuário autenticado (JWT) e geram URLs pré-assinadas com expiração curta (10 min).

### Diagnóstico rápido (R2/Edge Functions)

1. **401 Invalid JWT no `r2-presign-upload`**
   - Causa comum: sessão expirada ou `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` apontando para projeto diferente do deploy da function.
   - Ação: faça logout/login e valide que URL e anon key pertencem ao mesmo projeto Supabase.

2. **404 no `r2-presign-upload`**
   - Causa: função não publicada nesse projeto.
   - Ação: execute `supabase functions deploy r2-presign-upload` no projeto correto.

3. **500 com `R2 env not configured`**
   - Causa: secrets do R2 ausentes no Supabase.
   - Ação: configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`.

4. **Como validar rapidamente se URL/anon key pertencem ao mesmo projeto**
   - Compare o `project-ref` presente em `VITE_SUPABASE_URL` com o project ref onde as funções foram publicadas.
   - Se o front chama `https://<ref-A>.supabase.co/functions/v1/...` e a função foi deployada em `ref-B`, você verá 401/404 inconsistentes.

5. **Forçar refresh de sessão no browser**
   - Faça logout/login no app.
   - Se necessário, limpe o localStorage do domínio (chaves do Supabase) e recarregue a página para gerar novo JWT.

6. **Healthcheck autenticado da configuração R2**
   - Chame `GET /functions/v1/r2-health` com `Authorization: Bearer <jwt>` para confirmar autenticação + presença de envs R2 sem expor secrets.

### Smoke test (R2)

1. Crie uma OS com um arquivo pequeno.
2. Verifique:
   - O objeto apareceu no R2 com a key esperada.
   - `os_order_asset_jobs`: **PENDING → PROCESSING → DONE → CLEANED**.
   - O arquivo existe no SMB.
   - O objeto foi removido do R2 e `deleted_from_storage_at` está preenchido.
