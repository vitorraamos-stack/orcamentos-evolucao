# Deploy e rollback

## Ordem de deploy
1. Aplicar migrations (`supabase/migrations/`).
2. Validar local/CI com `npm ci` + `npm run verify:prod`.
3. Deploy frontend/serverless na Vercel.
4. Deploy das Edge Functions Supabase.
5. Rodar smoke test: login, materiais, Hub OS kiosk/boards, upload/download R2 e otimização de instalações.

## CI mínimo
Workflow `ci.yml` executa:
- `npm ci`
- `npm run verify:prod`

## Rollback
1. Reverter commit e redeploy frontend/serverless na Vercel.
2. Redeploy da revisão anterior das Edge Functions Supabase.
3. Se necessário, desabilitar temporariamente uso de fluxo novo no frontend (feature toggle operacional).
4. Para banco: criar migration corretiva (não editar histórico aplicado).
