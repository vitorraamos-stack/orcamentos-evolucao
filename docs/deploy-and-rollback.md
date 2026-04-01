# Deploy e rollback

## Ordem de deploy
1. Pré-deploy:
   - Aplicar migrations pendentes (`supabase/migrations/`).
   - Validar variáveis obrigatórias (Vercel + Supabase + ORS + R2).
   - Executar localmente `npm ci` e `npm run verify:prod`.
2. CI obrigatória:
   - Workflow `ci.yml` precisa estar verde antes do deploy.
   - O pipeline executa o mesmo caminho canônico de produção: `npm ci` + `npm run verify:prod`.
3. Deploy frontend/serverless na Vercel:
   - `vercel.json` usa `installCommand: npm ci`.
   - `vercel.json` usa `buildCommand: npm run build` (que já executa check + test + build).
4. Deploy das Edge Functions Supabase:
   - Workflow `deploy-supabase-functions.yml` executa `npm ci` + `npm run verify:prod` antes do deploy.
   - O deploy é feito por allowlist explícita (`r2-presign-upload`, `r2-presign-download`, `r2-delete-objects`, `r2-health`) para evitar republicação acidental de função legada.
   - `optimize-installation-route` não é rota canônica e não deve ser publicada.
5. Pós-deploy (smoke test obrigatório):
   - Login e autorização admin.
   - Fluxo Hub OS (kanban/kiosk).
   - Upload/download/delete de R2 com usuário autorizado.
   - Tentativa de acesso R2 não autorizado (esperado 403/401).
   - `POST /api/hub-os/optimize-installations` com caso pequeno válido e com indisponibilidade externa controlada.

## CI mínimo
Workflow `ci.yml` executa:
- `npm ci`
- `npm run verify:prod`

## Critério de alinhamento CI x Deploy
- Não aprovar fluxo de deploy que use `npm install` no lugar de `npm ci`.
- Não aprovar build de deploy sem `npm run verify:prod`.
- Versões de runtime usadas em CI e deploy devem permanecer em Node 22 / npm 10.

## Rollback
1. Reverter commit e redeploy frontend/serverless na Vercel.
2. Redeploy da revisão anterior das Edge Functions Supabase.
3. Se necessário, desabilitar temporariamente uso de fluxo novo no frontend (feature toggle operacional).
4. Para banco: criar migration corretiva (não editar histórico aplicado).

## Limpeza manual de legado (fora do repositório)
- Se a função remota `optimize-installation-route` ainda existir no projeto Supabase, remover manualmente:
  - `supabase functions delete optimize-installation-route --project-ref <PROJECT_ID>`
- Após remover a função legada, revisar e excluir o secret `MAPBOX_ACCESS_TOKEN` se ele não for usado por mais nenhuma função.
