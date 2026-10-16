# 19V-C2 — Procedimento de rollback (somente revisão)

**Não é um script automático.** Não executar esta documentação no banco.
A reversão seria uma nova migration aprovada e versionada.

1. Confirmar quem está realizando a reversão, motivo, estado atual
   de C2, transações em andamento e preservação das evidências.
2. Confirmar versão e hash da RPC C2 e a configuração do schema interno.
3. Restaurar a função pública
   `public.finalize_legacy_payment_submission(uuid)` com o corpo
   19V-A exatamente como versionado em
   `supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql`,
   restaurando `SECURITY INVOKER`, `search_path=''` e grants limitados.
4. Remover os três triggers C2 dos objetos legados e suas funções,
   com checagem de propriedade e sem tocar na função 19T de provas.
5. Se necessário, retornar o privilégio UPDATE geral de
   `public.os` para `authenticated` apenas após aprovar
   explicitamente a janela de exposição de gravação financeira
   direta. Nunca conceder novamente TRUNCATE/TRIGGER/REFERENCES
   removidos na 19V-C1.
6. Revogar EXECUTE/USAGE da helper privada, remover sua função,
   e só então remover o schema privado se vazio.
7. Verificar hashes, RLS, função financeira pública, uso de UI e
   rastreamento de eventos, **sem criar ou alterar pagamentos reais**.
8. Registrar versão, operador, janela, impacto e resultados.

Se o erro ocorrer apenas no frontend, revisar o deployment Vercel
separadamente; uma reversão de UI não implica que o schema do banco
deva ser revertido. Nunca compensar pagamentos apagando eventos,
alterando provas 19T ou editando dados financeiros manualmente.
