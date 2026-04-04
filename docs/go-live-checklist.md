# Go-live checklist (produção)

## 1) Segurança e segredos
- Confirmar secrets do Supabase Edge Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Confirmar variáveis da Vercel API: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORS_API_KEY`.
- Confirmar variáveis do front Vite: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OS_FOLDER_BASE`.
- Confirmar que não há secrets ausentes para integrações externas (ORS/Supabase/R2) no ambiente de produção.
- Confirmar que o secret legado `MAPBOX_ACCESS_TOKEN` foi removido do Supabase se não houver outro consumo ativo.

## 2) Qualidade e build
- Executar localmente:
  - `npm ci`
  - `npm run verify:prod`
  - `npm run verify:predeploy`
- O preflight valida variáveis obrigatórias por contexto (Vite, Vercel API, Edge Functions, agente Windows/SMB) sem imprimir valores sensíveis.
- Garantir CI verde no branch de release.
- Garantir paridade de deploy: Vercel e workflow de Edge Functions não podem usar caminho mais fraco que `npm ci` + `npm run verify:prod`.

## 3) Pré-deploy de dados e dependências
- Revisar migrations pendentes e plano de rollback.
- Confirmar disponibilidade dos serviços externos (Supabase, Cloudflare R2, OpenRouteService).
- Registrar janela de deploy e responsáveis técnicos/on-call.

## 4) R2 / Hub OS
- Validar upload/download/delete em OS real de homologação.
- Confirmar que payload com `bucket` é rejeitado (400) nas três Edge Functions.
- Confirmar bloqueio de key inválida (traversal, chave vazia e chave fora do padrão `os_orders/<uuid>/...`).
- Confirmar bloqueio de key fora do escopo autorizado da OS (403).
- Confirmar que comprovantes (`Financeiro/Comprovante` e `payment_proofs`) não podem ser removidos pela função de delete.
- Validar que usuários sem módulo `hub_os` recebem 403 nas funções R2.

## 5) Otimização de instalações
- Testar `POST /api/hub-os/optimize-installations` com payload válido e inválido (limites e datas).
- Confirmar rejeição de lote acima do limite de OS por request.
- Confirmar comportamento de timeout ORS/geocode (erro controlado com `stage` e status previsível).
- Confirmar fallback com resposta válida quando otimização externa indisponível.
- Confirmar que a Edge Function legada `optimize-installation-route` não está ativa no projeto Supabase.

## 6) Deploy operacional
- Vercel é o alvo canônico do front-end/serverless.
- Publicar Edge Functions somente após CI + verify:prod.
- Publicar Edge Functions apenas pela allowlist canônica (`r2-presign-upload`, `r2-presign-download`, `r2-delete-objects`, `r2-health`).
- Não usar deploy manual com variáveis ausentes.

## 7) Pós-go-live imediato
- Monitorar logs de `r2-presign-upload`, `r2-presign-download`, `r2-delete-objects` e `hub-os/optimize-installations` por 24h.
- Revisar taxa de falhas por stage (`auth`, `input`, `geocode`, `optimization`, `db_update`).
