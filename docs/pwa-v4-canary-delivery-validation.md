# EvoluSystem PWA V4 — validação da entrega piloto (16/11/2026)

## Escopo seguro
Esta branch acrescenta uma trava **independente da inscrição de aparelhos**:
a fila só materializa e reivindica trabalhos dos UUIDs em
`PWA_PUSH_CANARY_USER_IDS` (1–5 UUIDs válidos e únicos).
O cadastro em Vercel não basta para permitir entrega a outros usuários.

### Constatações no Supabase (somente leitura)
- Um dispositivo ativo cadastrado para o usuário piloto; zero dispositivos dos demais usuários.
- Zero eventos no outbox e zero trabalhos pendentes.
- `generation_enabled=false` e `delivery_enabled=false`.
- Três gatilhos operacionais presentes, mas sem criar eventos enquanto a geração está desligada.
- RPCs existentes do motor acessíveis ao `service_role`, não aos usuários comuns.

### Correções propostas na branch
- O backend exige uma lista canário válida também na rota de despacho.
- Materialização: nova RPC `push_v4_expand_canary_outbox` aplica o filtro de destinatários **antes de criar notificações**.
- Seleção: nova RPC `push_v4_claim_canary_jobs` restringe a lista por `push_subscriptions.user_id` e confirma que pertence ao destinatário.
- A migration revoga o `EXECUTE` do `service_role` nas duas variantes legadas sem restrição, evitando que deploys antigos as utilizem.
- Contratos de segurança e testes de despacho atualizados.
- **Não** há cron novo, mudança em env, ativação de flags, envio real, criação de OS nem alterações de dados neste PR.

### Etapas necessárias antes do envio real
1. Aprovar o PR e validar CI.
2. Com autorização específica, aplicar a migration no Supabase; verificar `GRANT` e flags ainda false.
3. Validar chaves VAPID em preflight autenticado no servidor, sem exibir valores sensíveis; esta conexão não consegue ler as env da Vercel (403).
4. Preparar um mecanismo de teste pontual para o dispositivo piloto, sem criar OS fictícia e sem permitir outros destinatários.
5. Somente com nova autorização de ativação, habilitar sequencialmente as duas flags do banco, as flags de envio da Vercel e o rollout; testar entrega real.
6. Agendar o motor somente depois que a entrega piloto e o bloqueio a usuários não participantes tiverem sido confirmados.

**Rollback imediato:** desligar `delivery_enabled` no Supabase. O agendamento permanece ausente nesta etapa.
