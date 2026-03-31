# Go-live checklist (produção)

## 1) Segurança e segredos
- Confirmar secrets do Supabase Edge Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Confirmar variáveis da Vercel API: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORS_API_KEY`.
- Confirmar variáveis do front Vite: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OS_FOLDER_BASE`.

## 2) Qualidade e build
- Executar localmente:
  - `npm ci`
  - `npm run verify:prod`
- Garantir CI verde no branch de release.

## 3) R2 / Hub OS
- Validar upload/download/delete em OS real de homologação.
- Confirmar que payload com `bucket` é rejeitado (400) nas três Edge Functions.
- Confirmar que comprovantes (`Financeiro/Comprovante` e `payment_proofs`) não podem ser removidos pela função de delete.
- Validar que usuários sem módulo `hub_os` recebem 403 nas funções R2.

## 4) Otimização de instalações
- Testar `POST /api/hub-os/optimize-installations` com payload válido e inválido (limites e datas).
- Confirmar comportamento de timeout ORS (erro controlado e com stage).

## 5) Deploy operacional
- Vercel é o alvo canônico do front-end/serverless.
- Publicar Edge Functions somente após CI + verify:prod.
- Não usar deploy manual com variáveis ausentes.

## 6) Pós-go-live imediato
- Monitorar logs de `r2-presign-upload`, `r2-presign-download`, `r2-delete-objects` e `hub-os/optimize-installations` por 24h.
- Revisar taxa de falhas por stage (`auth`, `input`, `geocode`, `optimization`, `db_update`).
