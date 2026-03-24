# Deploy e rollback

## Ordem de deploy
1. Aplicar migrations (`supabase/migrations/`).
2. Deploy frontend.
3. Rodar smoke test: login, materiais, Hub OS kiosk/boards.

## CI mínimo
Workflow `ci.yml` executa:
- `npm ci`
- `npm run check`
- `npm run test`
- `npm run build`

## Rollback
1. Reverter commit e redeploy frontend.
2. Se necessário, desabilitar temporariamente uso da RPC no frontend.
3. Para banco: criar migration corretiva (não editar histórico aplicado).
