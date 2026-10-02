# EVOLUÇÃO OS 2.0 — FASE 4.6a
## Governança de OS
## Arquivar + Excluir definitivamente + Auditoria independente + limpeza segura de R2

REPOSITÓRIO
vitorraamos-stack/orcamentos-evolucao

BRANCH BASE
main

==================================================
0. ESTADO DE REFERÊNCIA
==================================================

Base atual esperada:

Hotfix 4.5b já presente no main.

Merge commit de referência:

9694c554040529f67bd5e28312604c23f87856cd

Antes de iniciar:

1. atualizar main;
2. confirmar esse commit ou commit posterior;
3. criar NOVA branch;
4. não reverter nenhuma Fase 4.x;
5. pesquisar TODOS os usos atuais de:
   - archiveOrder
   - deleteOrder
   - hub_os_archive_order_secure
   - hub_os_delete_order_secure
6. tratar esta mudança como GOVERNANÇA/SEGURANÇA,
   não apenas como botão de UI.

==================================================
1. CONTEXTO
==================================================

O sistema atualmente possui:

ARCHIVE RPC:

hub_os_archive_order_secure(
  uuid,
  text,
  jsonb
)

DELETE RPC antiga:

hub_os_delete_order_secure(
  uuid,
  text,
  jsonb
)

A RPC antiga de delete:

- exige gerente/admin;
- registra evento;
- executa DELETE em os_orders.

PORÉM:

o domínio atual cresceu muito depois dela.

Hoje uma OS pode possuir:

- itens;
- operações de item;
- assets;
- jobs de assets;
- parcelas financeiras;
- instalações;
- checklist de instalação;
- evidências de instalação;
- entregas;
- eventos;
- comentários;
- responsáveis;
- prazos;
- flow state;
- kiosk;
- installation feedback;
- payment proof legado;
- arquivos R2.

Existem ainda FKs sem ON DELETE CASCADE, especialmente:

os_installations
os_deliveries

Portanto:

PROIBIDO simplesmente expor a RPC antiga na interface.

==================================================
2. OBJETIVO DA FASE
==================================================

Criar uma governança clara com duas ações distintas:

A) ARQUIVAR OS

Para:

- cancelamento;
- OS real que não deve mais aparecer;
- duplicidade que deve manter histórico;
- situações em que dados precisam permanecer.

Arquivar:

- NÃO apaga dados;
- NÃO remove arquivos;
- NÃO remove histórico;
- apenas retira a OS do fluxo operacional.

--------------------------------------------------

B) EXCLUIR DEFINITIVAMENTE

Somente para:

- OS de teste;
- OS criada por engano;
- duplicata sem valor histórico/financeiro;
- erro de cadastro que não deve permanecer.

Excluir definitivamente:

- remove a OS;
- remove dependências operacionais;
- remove dados relacionados;
- tenta remover objetos R2 elegíveis;
- deixa auditoria independente da OS;
- é irreversível.

==================================================
3. REGRA DE SEGURANÇA PRINCIPAL
==================================================

EXCLUSÃO DEFINITIVA:

somente:

admin
gerente

Validação:

FRONTEND
+
RPC

Frontend NÃO é autorização.

==================================================
4. NÃO CRIAR DELETE DIRETO
==================================================

PROIBIDO no frontend:

supabase
  .from("os_orders")
  .delete()

PROIBIDO deletar tabelas relacionadas pelo browser.

Toda exclusão de banco deve ocorrer:

SERVER-SIDE
TRANSACIONALMENTE

==================================================
5. NOVA MIGRATION
==================================================

Criar migration nova.

Nome sugerido:

supabase/migrations/
20261002220000_phase_4_6a_order_governance.sql

Ajustar timestamp se necessário,
mas manter migration posterior às atuais.

==================================================
6. NÃO APLICAR A MIGRATION
==================================================

IMPORTANTE:

O CODEX deve:

- criar migration;
- testar;
- commitar;
- criar PR.

NÃO:

- aplicar no Supabase production;
- executar migration remotamente;
- deployar Edge Function.

A aplicação será autorizada separadamente após auditoria.

==================================================
7. NOVA TABELA DE AUDITORIA
==================================================

Criar:

public.os_order_deletion_audit

Essa tabela NÃO deve possuir FK para os_orders.

Motivo:

o registro precisa sobreviver depois que a OS for excluída.

==================================================
8. COLUNAS DE AUDITORIA
==================================================

Estrutura aproximada:

id uuid primary key default gen_random_uuid()

original_os_id uuid not null

os_number bigint null

sale_number text null

client_name text null

title text null

reason text not null

deleted_by uuid null
references auth.users(id)
on delete set null

deleted_at timestamptz not null
default now()

snapshot jsonb not null
default '{}'::jsonb

dependency_counts jsonb not null
default '{}'::jsonb

r2_keys text[] not null
default '{}'

r2_cleanup_status text not null

r2_cleanup_attempts integer not null
default 0

r2_last_deleted_count integer not null
default 0

r2_cleanup_errors jsonb not null
default '[]'::jsonb

r2_cleanup_completed_at timestamptz null

r2_cleanup_last_attempt_at timestamptz null

==================================================
9. STATUS DE CLEANUP
==================================================

Adicionar CHECK:

r2_cleanup_status in (
  'PENDING',
  'COMPLETED',
  'PARTIAL',
  'NOT_REQUIRED'
)

==================================================
10. ÍNDICES
==================================================

Criar:

index por original_os_id

index por deleted_at desc

index por r2_cleanup_status

==================================================
11. RLS AUDITORIA
==================================================

Habilitar RLS.

Authenticated:

não pode INSERT direto.

não pode UPDATE direto.

não pode DELETE.

SELECT:

somente gerente/admin.

Usar helper canônico existente de manager,
se houver.

Exemplo:

public.is_manager(auth.uid())

SE já existir.

Não criar vocabulário paralelo de autorização.

==================================================
12. SNAPSHOT DA OS EXCLUÍDA
==================================================

snapshot deve guardar somente dados importantes para auditoria.

Incluir:

id
os_number
sale_number
client_name
title
art_status
prod_status
logistic_type
archived
created_at
updated_at

NÃO precisa armazenar:

todos os comentários
todos os arquivos
todos os eventos.

dependency_counts já documentará volume relacionado.

==================================================
13. PREVIEW DE EXCLUSÃO
==================================================

Criar RPC:

public.hub_os_delete_order_preview_secure(
  p_os_id uuid
)

RETURNS jsonb

SECURITY DEFINER

search_path public

==================================================
14. AUTORIZAÇÃO PREVIEW
==================================================

Executar:

hub_os_assert_orders_access()

Depois buscar role.

Somente:

admin
gerente

Caso contrário:

42501

==================================================
15. RETORNO DO PREVIEW
==================================================

Retornar JSON estruturado:

{
  "order": {
    "id": ...,
    "display_number": ...,
    "sale_number": ...,
    "os_number": ...,
    "client_name": ...,
    "prod_status": ...,
    "art_status": ...,
    "archived": ...
  },

  "allowed": true/false,

  "blockers": [...],

  "counts": {
    ...
  },

  "r2_object_count": N,

  "expected_confirmation": "TESTE-41"
}

==================================================
16. IDENTIFICADOR DE CONFIRMAÇÃO
==================================================

expected_confirmation:

se os_number existe:

os_number::text

caso contrário:

sale_number

Usar exatamente a mesma lógica que o header atual usa
para identificar a OS.

==================================================
17. CONTAGEM DE DEPENDÊNCIAS
==================================================

Preview deve contar:

items

item_operations

assets

asset_jobs

finance_installments

installations

installation_checklist

installation_evidence

deliveries

order_events

legacy_os_events

payment_proofs

flow_state

kiosk_rows

installation_feedbacks

assignees

comments

deadlines

==================================================
18. BLOQUEADORES FINANCEIROS
==================================================

A exclusão definitiva deve ser BLOQUEADA se existir:

finance installment com status:

CONCILIADO
LANCADO

==================================================
19. BLOQUEAR COMPROVANTE FINANCEIRO
==================================================

Também bloquear se existir qualquer:

os_order_assets.asset_type = 'PAYMENT_PROOF'

OU

registro em:

os_payment_proof

para aquela OS.

==================================================
20. MOTIVO
==================================================

A UI deve explicar:

"Esta OS possui histórico/comprovante financeiro sujeito à
retenção e não pode ser excluída definitivamente."

Sugestão:

"Arquive a OS para removê-la da operação preservando o histórico."

==================================================
21. CÓDIGOS DOS BLOCKERS
==================================================

Retornar objetos estruturados:

{
  "code": "FINANCE_SETTLED",
  "message": "..."
}

{
  "code": "PAYMENT_PROOF_RETENTION",
  "message": "..."
}

Não retornar apenas string concatenada.

==================================================
22. PREVIEW NÃO É AUTORIZAÇÃO
==================================================

IMPORTANTE:

A RPC de exclusão REAL deve recalcular todos os blockers.

Nunca confiar no preview enviado pelo frontend.

==================================================
23. NOVA RPC CANÔNICA DE DELETE
==================================================

Criar:

public.hub_os_delete_order_secure_v2(
  p_os_id uuid,
  p_reason text,
  p_confirmation text,
  p_payload jsonb default '{}'::jsonb
)

RETURNS jsonb

SECURITY DEFINER

search_path public

==================================================
24. AUTORIZAÇÃO V2
==================================================

Usar:

hub_os_assert_orders_access()

Somente:

admin
gerente

==================================================
25. LOCK
==================================================

Buscar OS:

SELECT *
FROM os_orders
WHERE id = p_os_id
FOR UPDATE

Se não existir:

P0002

==================================================
26. MOTIVO OBRIGATÓRIO
==================================================

p_reason:

trim

mínimo 5 caracteres.

Não aceitar:

null
""
"delete"

A mensagem deve ser clara:

"Informe o motivo da exclusão."

==================================================
27. CONFIRMAÇÃO OBRIGATÓRIA
==================================================

Calcular no servidor:

v_expected_confirmation

igual ao identificador do preview.

Comparar:

trim(p_confirmation)

com valor esperado.

Pode ser case-insensitive para sale_number textual.

Se divergente:

22023

Mensagem:

"Confirmação da OS inválida."

==================================================
28. BLOCKERS NO DELETE
==================================================

Recalcular:

finance settled
payment proof retention

DENTRO DA RPC.

Se existir blocker:

não excluir nada.

A transação deve abortar.

==================================================
29. R2 KEYS
==================================================

Antes da exclusão:

coletar object_path únicos de os_order_assets que:

object_path IS NOT NULL

deleted_from_storage_at IS NULL

e armazenamento seja compatível com R2.

Seguir semântica já usada no sistema:

storage_provider = 'r2'

OU existência de storage_bucket/bucket
quando isso representa legado R2.

==================================================
30. PAYMENT PROOF
==================================================

PAYMENT_PROOF não deve chegar na lista de r2_keys,
porque a presença dele deve bloquear a exclusão antes.

Preservar política atual de retenção.

==================================================
31. DEPENDENCY COUNTS
==================================================

Calcular counts ANTES de apagar.

Persistir em:

os_order_deletion_audit.dependency_counts

==================================================
32. CRIAR AUDIT ANTES DO DELETE
==================================================

Inserir audit row dentro da MESMA transação.

Status inicial:

se r2_keys vazio:

NOT_REQUIRED

senão:

PENDING

==================================================
33. AUDIT DEVE SOBREVIVER
==================================================

Audit não possui FK com os_orders.

Depois do DELETE:

registro permanece.

==================================================
34. ORDEM DE LIMPEZA
==================================================

Inspecionar FKs reais antes de implementar.

A lógica deve respeitar pelo menos:

1. installation evidence
2. installation checklist
3. installations
4. deliveries
5. installation feedbacks
6. flow state
7. kiosk rows
8. legacy os_event
9. os_orders_event
10. outras tabelas não-cascade
11. os_orders

==================================================
35. CASCADES EXISTENTES
==================================================

Itens como:

os_order_items
os_order_item_operations

os_order_assets
os_order_asset_jobs

finance installments

assignees
comments
deadlines

podem aproveitar CASCADE onde o schema real garante isso.

PORÉM:

não presumir.

Inspecionar constraint real.

==================================================
36. INSTALLATION DEPENDENCIES
==================================================

Antes de excluir os_installations:

excluir:

os_installation_checklist_items

os_installation_evidence

relacionados às installations da OS.

==================================================
37. ASSET FK DE EVIDÊNCIA
==================================================

Lembrar que:

os_installation_evidence.asset_id

também referencia os_order_assets.

Portanto evidências precisam sair antes dos assets.

==================================================
38. SOURCE TABLES
==================================================

Excluir linhas onde source_id = p_os_id em:

hub_os_order_flow_state

os_kiosk_board

os_installation_feedbacks

Preferencialmente também validar source_type quando apropriado.

Não apagar registros de outra fonte por engano.

==================================================
39. EVENTS
==================================================

Excluir histórico operacional da OS em:

os_orders_event

os_event

A auditoria definitiva passa a ser:

os_order_deletion_audit

==================================================
40. PAYMENT PROOF LEGADO
==================================================

Como qualquer os_payment_proof bloqueia hard delete:

normalmente a RPC não chegará à etapa de remoção.

Ainda assim o SQL deve ser defensivo.

==================================================
41. DELETE FINAL
==================================================

Somente depois de todas as validações:

DELETE FROM public.os_orders
WHERE id = p_os_id;

==================================================
42. RETORNO V2
==================================================

Retornar:

{
  "audit_id": "...",
  "os_id": "...",
  "display_number": "...",
  "sale_number": "...",
  "client_name": "...",
  "counts": {...},
  "r2_keys": [...],
  "r2_cleanup_status": "PENDING"
}

==================================================
43. COMPATIBILIDADE COM RPC ANTIGA
==================================================

NÃO deixar a função antiga como bypass.

Manter assinatura:

hub_os_delete_order_secure(
  uuid,
  text,
  jsonb
)

por compatibilidade.

Mas transformá-la em wrapper seguro.

==================================================
44. WRAPPER ANTIGO
==================================================

A função antiga deve:

extrair do payload:

confirmation

e chamar:

hub_os_delete_order_secure_v2(...)

Sem confirmation:

deve falhar.

Assim nenhum caller legado consegue excluir sem confirmação forte.

==================================================
45. RETORNO DA RPC ANTIGA
==================================================

Pode continuar RETURNS void
para não quebrar contrato histórico.

Ela apenas:

PERFORM hub_os_delete_order_secure_v2(...)

==================================================
46. GRANTS
==================================================

Para:

preview
v2
compat wrapper
cleanup marker

REVOKE:

public
anon

GRANT:

authenticated

Autorização real continua dentro da RPC.

==================================================
47. CLEANUP DE R2
==================================================

Existe Edge Function atual:

r2-delete-objects

REUTILIZAR.

NÃO criar outra Edge Function.

==================================================
48. PROBLEMA DE AUTORIZAÇÃO ATUAL DO R2
==================================================

Hoje r2-delete-objects:

extrai os_id da key

e valida o escopo consultando a OS.

Depois do hard delete:

a OS não existe mais.

Portanto:

o fluxo atual não consegue autorizar cleanup pós-delete.

==================================================
49. EXTENDER r2-delete-objects
==================================================

Alterar payload para aceitar opcionalmente:

{
  keys: string[],
  deletionAuditId?: string
}

Compatibilidade:

payload sem deletionAuditId
continua exatamente como hoje.

==================================================
50. CAMINHO NORMAL R2
==================================================

Se deletionAuditId NÃO existir:

preservar 100%:

authorizeR2OrderScope(...)

==================================================
51. CAMINHO DE HARD DELETE
==================================================

Se deletionAuditId existir:

1. exigir usuário autenticado;
2. exigir gerente/admin;
3. carregar os_order_deletion_audit;
4. validar que audit existe;
5. validar que todas as keys solicitadas pertencem a audit.r2_keys;
6. validar que os_id extraído das keys corresponde a original_os_id;
7. preservar bloqueio de payment proof;
8. somente então executar DeleteObjects.

==================================================
52. NÃO LIBERAR KEYS ARBITRÁRIAS
==================================================

deletionAuditId NÃO pode funcionar como bypass genérico.

A key precisa existir exatamente em:

audit.r2_keys

==================================================
53. POLÍTICA DE PAYMENT PROOF DO EDGE
==================================================

Preservar:

isProtectedPaymentProofKey()

Não remover.

Não afrouxar.

==================================================
54. MARCAR RESULTADO DE R2
==================================================

Criar RPC:

hub_os_mark_order_delete_cleanup_secure(
  p_audit_id uuid,
  p_deleted_count integer,
  p_errors jsonb
)

==================================================
55. MARK CLEANUP AUTORIZAÇÃO
==================================================

Somente:

admin
gerente

==================================================
56. STATUS CLEANUP
==================================================

Se errors vazio:

COMPLETED

Se errors possui itens:

PARTIAL

Atualizar:

r2_cleanup_attempts += 1

r2_last_deleted_count

r2_cleanup_errors

r2_cleanup_last_attempt_at

Se COMPLETED:

r2_cleanup_completed_at = now()

==================================================
57. EDGE MARCA O AUDIT
==================================================

Após DeleteObjects:

r2-delete-objects deve chamar:

hub_os_mark_order_delete_cleanup_secure

quando deletionAuditId existir.

==================================================
58. FALHA AO MARCAR AUDIT
==================================================

Se objetos foram apagados mas update do audit falhou:

não fingir que nada aconteceu.

Retornar payload indicando:

storageDeleteSucceeded: true

auditUpdateSucceeded: false

Frontend deve mostrar warning.

==================================================
59. IDEMPOTÊNCIA
==================================================

Retry da limpeza deve ser seguro.

Enviar novamente as mesmas keys é aceitável.

O fluxo deve tolerar objeto já inexistente no R2.

==================================================
60. NÃO APAGAR SMB AUTOMATICAMENTE
==================================================

FASE 4.6a NÃO deve apagar:

pastas de cliente no servidor local;
SMB;
arquivos arbitrários do Windows;
diretórios externos.

Motivo:

essa política de retenção precisa ser tratada separadamente.

==================================================
61. AVISO SOBRE ARQUIVOS LOCAIS
==================================================

Não precisa alarmar o usuário no fluxo comum.

Mas documentar na arquitetura:

Hard delete remove:

- banco;
- R2 elegível.

Não garante remoção de cópias locais/SMB.

==================================================
62. FRONTEND — LOCAL DA AÇÃO
==================================================

Arquivo principal:

src/modules/orders/pages/OrderDetailPage.tsx

Header:

src/modules/orders/components/OrderHeader.tsx

Adicionar para gerente:

botão/dropdown:

"Mais ações"

Ícone:

MoreHorizontal
ou EllipsisVertical.

==================================================
63. VISIBILIDADE
==================================================

Mais ações:

somente se:

hubPermissions.isManager

==================================================
64. MENU
==================================================

Itens:

Arquivar OS

separator

Excluir definitivamente

==================================================
65. CORES
==================================================

Arquivar:

neutro

Excluir definitivamente:

destructive

==================================================
66. NÃO COLOCAR DELETE NA CENTRAL
==================================================

Neste momento:

NÃO adicionar botão vermelho diretamente nos cards da Central.

Exclusão definitiva deve acontecer:

somente no detalhe da OS.

Isso reduz exclusões acidentais.

==================================================
67. ARQUIVAR — MODAL
==================================================

Criar componente:

ArchiveOrderDialog

ou:

OrderGovernanceDialog

Título:

"Arquivar OS"

Descrição:

"A OS será removida das filas operacionais, mas seu histórico,
arquivos e registros serão preservados."

==================================================
68. MOTIVO DO ARQUIVO
==================================================

Textarea obrigatório:

"Motivo do arquivamento"

Mínimo:

5 caracteres.

==================================================
69. CTA ARQUIVO
==================================================

"Arquivar OS"

Durante:

"Arquivando..."

==================================================
70. ARCHIVE API
==================================================

Atualizar wrapper atual para aceitar:

archiveOrder({
  id,
  reason,
  actorName?
})

ou API equivalente.

Passar reason real para:

hub_os_archive_order_secure

Não usar somente:

"manual_archive"

como motivo final.

==================================================
71. SUCESSO ARCHIVE
==================================================

Toast:

"OS arquivada."

Navegar para:

/os

==================================================
72. EXCLUSÃO — ABRIR PREVIEW
==================================================

Ao clicar:

"Excluir definitivamente"

primeiro chamar:

hub_os_delete_order_preview_secure

Mostrar loading dentro do modal.

==================================================
73. DELETE DIALOG
==================================================

Criar:

DeleteOrderDialog

Visual destructive.

Título:

"Excluir OS definitivamente?"

==================================================
74. TEXTO DE ALERTA
==================================================

Mostrar claramente:

"Esta ação é irreversível."

"Use exclusão definitiva somente para OS de teste,
criadas por engano ou duplicadas sem histórico que deva ser
preservado."

"Para cancelamentos reais, utilize Arquivar OS."

==================================================
75. IDENTIDADE
==================================================

Mostrar:

OS #...

Cliente

Status atual

==================================================
76. IMPACTO
==================================================

Mostrar somente counts > 0.

Exemplo:

Esta exclusão removerá:

2 itens

4 operações

1 instalação

8 itens de checklist

3 arquivos

12 eventos

1 entrega

==================================================
77. R2
==================================================

Se r2_object_count > 0:

mostrar:

"3 arquivos do armazenamento serão removidos."

==================================================
78. BLOCKERS
==================================================

Se preview.allowed === false:

mostrar Alert destructive.

Listar blocker messages.

==================================================
79. DELETE BLOQUEADO
==================================================

Se blockers existem:

botão Excluir definitivamente NÃO aparece
ou fica disabled.

Mostrar CTA:

"Arquivar OS"

==================================================
80. CONFIRMAÇÃO TEXTUAL
==================================================

Campo:

"Digite {expected_confirmation} para confirmar"

Exemplo:

Digite TESTE-41 para confirmar

==================================================
81. MOTIVO DO DELETE
==================================================

Textarea:

"Motivo da exclusão"

Obrigatório.

Mínimo:

5 caracteres.

==================================================
82. BOTÃO DELETE
==================================================

Habilitado somente se:

preview.allowed

AND

confirmation matches expected_confirmation

AND

reason.trim().length >= 5

AND

!busy

==================================================
83. CTA
==================================================

"Excluir definitivamente"

Durante:

"Excluindo..."

==================================================
84. NOVO REPOSITORY
==================================================

Preferência arquitetural:

criar:

src/modules/orders/repositories/orderGovernanceRepository.ts

==================================================
85. TIPOS
==================================================

Criar tipos:

OrderDeletionBlocker

OrderDeletionCounts

OrderDeletionPreview

OrderDeletionResult

OrderDeletionStorageCleanupResult

==================================================
86. FUNÇÕES
==================================================

Implementar:

getOrderDeletionPreview(orderId)

archiveOrderSecure(...)

deleteOrderPermanently(...)

cleanupDeletedOrderStorage(...)

==================================================
87. DELETE API
==================================================

deleteOrderPermanently:

chama:

hub_os_delete_order_secure_v2

com:

p_os_id
p_reason
p_confirmation
p_payload

==================================================
88. PAYLOAD
==================================================

p_payload pode conter:

actor_name

origin: "order_detail"

NÃO confiar nesses campos para autorização.

==================================================
89. CLEANUP FRONTEND
==================================================

Depois do DB delete:

se r2_keys.length === 0:

considerar concluído.

Toast:

"OS excluída definitivamente."

Navegar /os.

==================================================
90. SE EXISTIREM R2 KEYS
==================================================

Chamar:

r2-delete-objects

payload:

{
  keys: result.r2_keys,
  deletionAuditId: result.audit_id
}

==================================================
91. CLEANUP SUCESSO
==================================================

Se Edge responder sem errors:

toast:

"OS e arquivos excluídos definitivamente."

Navegar:

/os

==================================================
92. CLEANUP PARCIAL/FALHA
==================================================

IMPORTANTE:

A OS já terá sido apagada do banco.

NÃO mostrar:

"Exclusão falhou"

como se nada tivesse acontecido.

Mostrar:

"OS excluída do sistema, mas a limpeza de alguns arquivos
ainda está pendente."

==================================================
93. ESTADO PÓS-DELETE
==================================================

Manter modal aberto.

Oferecer:

[Tentar limpar arquivos novamente]

[Ir para Central]

==================================================
94. RETRY
==================================================

Retry pode enviar novamente:

todas as r2_keys

porque DeleteObjects é idempotente.

==================================================
95. NÃO RECARREGAR DETAIL APÓS DELETE
==================================================

Depois do DB delete:

NÃO chamar:

loadDetail()

A OS não existe mais.

==================================================
96. DOUBLE SUBMIT
==================================================

Durante:

preview
archive
delete
cleanup

desabilitar ações adequadamente.

==================================================
97. LEGACY HUBOS — PONTO CRÍTICO
==================================================

Existe hoje um uso direto de:

deleteOrder(...)

em:

src/pages/HubOS.tsx

Esse caminho NÃO pode continuar.

==================================================
98. REMOVER DELETE LEGADO INSEGURO
==================================================

No HubOS legado:

remover/hide a ação direta de hard delete.

Não manter:

optimistic:

setOrders(prev => prev.filter(...))

antes do backend.

==================================================
99. COMPORTAMENTO LEGADO
==================================================

Se for necessário manter algum botão:

substituir por:

"Abrir OS"

→ /os/:id

A exclusão definitiva deve acontecer no detalhe moderno.

==================================================
100. DELETEORDER ANTIGO FRONTEND
==================================================

Pesquisar todas as importações.

Não deixar nenhuma função pública no frontend que consiga chamar
a RPC antiga sem confirmation.

==================================================
101. API ANTIGA
==================================================

Pode:

remover deleteOrder antigo

SE nenhum caller restante.

OU:

alterar assinatura para exigir:

reason
confirmation

e internamente usar V2.

Não deixar assinatura:

deleteOrder(id, actorName?)

funcional.

==================================================
102. ARQUIVAMENTO LEGADO
==================================================

Não é necessário redesenhar o HubOS antigo.

Apenas eliminar o bypass inseguro de DELETE.

==================================================
103. R2 DELETE EDGE — COMPATIBILIDADE
==================================================

Todos os callers existentes de:

r2-delete-objects

devem continuar funcionando SEM alteração.

deletionAuditId é opcional.

==================================================
104. TESTE EDGE NORMAL
==================================================

Payload:

{
  keys: [...]
}

deve continuar usando:

authorizeR2OrderScope

==================================================
105. TESTE EDGE AUDIT
==================================================

Payload:

{
  keys: [...],
  deletionAuditId: "..."
}

deve usar audit manager-only.

==================================================
106. PAYMENT PROOF EDGE
==================================================

Continuar retornando 403 para:

/Financeiro/Comprovante/

/payment_proofs/

mesmo com deletionAuditId.

==================================================
107. PREDEPLOY EDGE
==================================================

Como Edge Function mudou:

executar obrigatoriamente:

npm run verify:predeploy:edge

==================================================
108. DEPLOY EDGE
==================================================

NÃO fazer deploy nesta tarefa.

Apenas preparar código.

==================================================
109. PREFLIGHT RUNTIME
==================================================

Atualizar:

tools/preflight/check-runtime-contracts.mjs

para incluir:

hub_os_delete_order_preview_secure

hub_os_delete_order_secure_v2

hub_os_mark_order_delete_cleanup_secure

Preservar:

hub_os_delete_order_secure

por compatibilidade.

==================================================
110. ARQUITETURA DOC
==================================================

Atualizar:

docs/evolucao-os-2-architecture.md

Documentar:

Archive x Hard Delete

retention financeira

audit independente

R2 cleanup

SMB fora do escopo automático.

==================================================
111. TESTES SQL / PGTAP
==================================================

Adicionar testes seguindo padrão existente.

Cobrir:

manager pode preview.

consultor não pode preview.

produção não pode preview.

manager pode hard delete permitido.

non-manager não pode hard delete.

==================================================
112. TESTE CONFIRMATION
==================================================

Confirmation incorreta:

erro.

OS permanece.

Dependências permanecem.

Nenhum audit de sucesso.

==================================================
113. TESTE REASON
==================================================

Reason vazio/curto:

erro.

Nenhum dado apagado.

==================================================
114. TESTE FINANCE SETTLED
==================================================

Criar OS fixture com installment:

CONCILIADO

Preview:

allowed false.

Delete:

falha.

==================================================
115. TESTE FINANCE LANCADO
==================================================

Mesmo comportamento.

==================================================
116. TESTE PAYMENT PROOF
==================================================

PAYMENT_PROOF asset:

bloqueia.

==================================================
117. TESTE LEGACY PAYMENT PROOF
==================================================

os_payment_proof:

bloqueia.

==================================================
118. TESTE PENDING FINANCE SEM PROOF
==================================================

Status:

AWAITING_PROOF

sem comprovante.

Não bloquear apenas pelo status.

==================================================
119. TESTE DEPENDÊNCIAS
==================================================

Fixture contendo:

item

operation

asset

job

installation

checklist

evidence

delivery

events

flow state

kiosk

Após hard delete:

zero resíduos operacionais.

==================================================
120. TESTE AUDIT
==================================================

Após exclusão:

os_orders:

0

os_order_deletion_audit:

1

Audit contém:

original_os_id
sale_number
client_name
reason
deleted_by
snapshot
counts

==================================================
121. TESTE R2 KEYS
==================================================

Asset R2 ativo:

entra em audit.r2_keys.

Asset já com:

deleted_from_storage_at

não precisa entrar.

==================================================
122. TESTE SEM R2
==================================================

Sem keys:

r2_cleanup_status = NOT_REQUIRED

==================================================
123. TESTE COM R2
==================================================

Com keys:

r2_cleanup_status = PENDING

==================================================
124. TESTE MARK CLEANUP
==================================================

errors []:

COMPLETED

completion timestamp preenchido.

==================================================
125. TESTE PARTIAL
==================================================

errors não vazio:

PARTIAL

attempts incrementa.

==================================================
126. TESTE RETRY
==================================================

PARTIAL → nova tentativa sem erros:

COMPLETED.

==================================================
127. TESTE WRAPPER ANTIGO
==================================================

hub_os_delete_order_secure antigo:

sem confirmation:

falha.

Com confirmation válida:

passa pelo V2.

==================================================
128. TESTE GRANTS
==================================================

anon:

não executa preview/v2/cleanup.

public:

não executa.

authenticated:

possui EXECUTE,
mas role validation continua server-side.

==================================================
129. TESTES FRONTEND — MENU
==================================================

Manager:

vê Mais ações.

Consultor:

não vê.

Arte:

não vê.

Produção:

não vê.

==================================================
130. TESTE ARQUIVAR
==================================================

Abrir dialog.

Reason curto:

disabled.

Reason válido:

archive RPC.

Success:

toast + /os.

==================================================
131. TESTE DELETE PREVIEW
==================================================

Clique Excluir:

preview carregado.

Counts renderizados.

Expected confirmation exibida.

==================================================
132. TESTE BLOCKED
==================================================

Preview com FINANCE_SETTLED:

não permite hard delete.

Mostra motivo.

Oferece Arquivar.

==================================================
133. TESTE CONFIRM FIELD
==================================================

Valor errado:

botão disabled.

Exato:

habilitado se reason válido.

==================================================
134. TESTE DELETE SUCCESS SEM R2
==================================================

RPC success:

r2_keys []

navega /os.

==================================================
135. TESTE DELETE SUCCESS COM R2
==================================================

RPC success:

r2_keys > 0

invoca r2-delete-objects com:

deletionAuditId.

==================================================
136. TESTE CLEANUP ERROR
==================================================

DB delete success.

Edge fail.

Não afirmar que OS ainda existe.

Mostrar:

"OS excluída do sistema..."

Retry disponível.

==================================================
137. TESTE RETRY CLEANUP
==================================================

Retry sucesso:

toast final.

Navega /os.

==================================================
138. TESTE LEGACY HUB
==================================================

Garantir que:

src/pages/HubOS.tsx

não possui mais fluxo direto:

deleteOrder(id, actorName)

com optimistic removal.

==================================================
139. TESTE ARQUIVO x DELETE
==================================================

Archive:

OS permanece no banco
archived=true.

Hard delete:

OS não permanece
audit permanece.

==================================================
140. ARQUIVADAS
==================================================

Uma OS arquivada pode ser hard-deleted pelo gerente
SE:

não houver blockers financeiros

e confirmation/reason forem válidos.

==================================================
141. NÃO CRIAR UNARCHIVE
==================================================

Unarchive NÃO faz parte da 4.6a.

Fase futura se necessário.

==================================================
142. NÃO ALTERAR OUTROS FLUXOS
==================================================

Não alterar:

Nova OS

Arte

Produção

Insumos

Instalações

Entregas

Retirada

Pendências Financeiras

Portal Financeiro

Dashboard.

==================================================
143. NÃO ALTERAR STATUS
==================================================

Nenhum status novo de OS.

Nenhum status de Arte.

Nenhum status de Produção.

==================================================
144. NÃO ALTERAR FINANCE DOMAIN
==================================================

Não mudar:

FinanceInstallmentStatus.

Apenas usar:

CONCILIADO
LANCADO

como blockers.

==================================================
145. NÃO CRIAR LIXEIRA NESTA FASE
==================================================

Não criar página:

/os/exclusoes

ainda.

Audit existe no backend.

Uma tela administrativa de exclusões pode ser:

Fase 4.6b

se necessário.

==================================================
146. NÃO APAGAR AUDIT
==================================================

Nenhuma UI deve permitir:

delete from os_order_deletion_audit.

==================================================
147. DADOS EXCLUÍDOS
==================================================

Hard delete remove dados operacionais.

Audit mínimo permanece propositalmente.

Isso NÃO é considerado resíduo operacional.

É trilha de governança.

==================================================
148. UX — TEXTO RECOMENDADO
==================================================

ARQUIVAR:

"Use para cancelamentos, duplicidades ou OS reais que precisam
sair da operação mantendo o histórico."

EXCLUIR:

"Use somente para OS de teste ou criadas por engano."

==================================================
149. UX — ALERTA FINANCEIRO
==================================================

Texto sugerido:

"Esta OS possui histórico financeiro que deve ser preservado e
não pode ser excluída definitivamente. Arquive a OS para removê-la
da operação."

==================================================
150. COMPONENTIZAÇÃO SUGERIDA
==================================================

Criar:

src/modules/orders/components/OrderActionsMenu.tsx

src/modules/orders/components/ArchiveOrderDialog.tsx

src/modules/orders/components/DeleteOrderDialog.tsx

src/modules/orders/repositories/orderGovernanceRepository.ts

Não exagerar além disso.

==================================================
151. ORDERHEADER
==================================================

OrderHeader pode receber:

canManage?: boolean

onArchive?: () => void

onDelete?: () => void

OU renderizar OrderActionsMenu diretamente.

Escolher estrutura que mantenha OrderHeader legível.

==================================================
152. RESPONSIVIDADE
==================================================

Menu deve funcionar:

desktop
tablet
mobile.

Dialogs:

max-width adequado.

Counts podem usar grid 2 colunas.

==================================================
153. ACESSIBILIDADE
==================================================

Mais ações:

aria-label.

Destructive action:

texto explícito.

Confirmation input:

Label.

Dialogs:

DialogTitle
DialogDescription.

Focus management preservado.

==================================================
154. ERROS
==================================================

Mostrar mensagem do servidor quando segura.

Não revelar SQL interno.

==================================================
155. EVENTOS
==================================================

Archive continua usando:

os_orders_event.

Hard delete usa:

os_order_deletion_audit.

Não registrar hard delete apenas em os_orders_event,
porque o histórico da OS é apagado.

==================================================
156. CONCORRÊNCIA
==================================================

RPC V2 deve ser autoritativa.

Mesmo que preview diga allowed:

se financeiro/comprovante surgir antes do DELETE:

RPC deve bloquear.

==================================================
157. TRANSAÇÃO
==================================================

Todo cleanup de DB + audit insert + order delete
deve ocorrer na mesma transação da RPC.

Se qualquer DELETE obrigatório falhar:

ROLLBACK TOTAL.

==================================================
158. R2 É PÓS-TRANSAÇÃO
==================================================

R2 não participa da transação PostgreSQL.

Por isso:

DB delete pode concluir
e storage cleanup ficar PENDING/PARTIAL.

Esse estado deve ser auditável e visível na resposta.

==================================================
159. NÃO APAGAR R2 ANTES DO DB DELETE
==================================================

Preferência arquitetural:

Banco primeiro.

R2 depois.

Motivo:

é menos perigoso deixar temporariamente arquivo órfão
do que deixar OS ativa apontando para arquivo já apagado.

==================================================
160. CHECKS
==================================================

Executar:

npm run check

npm run test

npm run build

npm run verify:prod

npm run verify:predeploy:edge

git diff --check

==================================================
161. TEST DISCOVERY
==================================================

Baseline recente:

388 testes
78 arquivos

Não exigir exatamente esse número porque esta fase adicionará
testes.

Mas:

a suíte NÃO pode descobrir menos que o baseline sem explicação.

Informar:

test files
tests

==================================================
162. TARGETED TESTS
==================================================

Executar explicitamente:

OrderDetailPage

OrderHeader / OrderActionsMenu

ArchiveOrderDialog

DeleteOrderDialog

orderGovernanceRepository

features/hubos api regression

HubOS legacy regression

R2 delete function / shared helpers

Supabase SQL tests quando suportado.

==================================================
163. MIGRATION DIFF
==================================================

Antes da PR:

confirmar que existe exatamente a migration esperada da 4.6a.

Não alterar migration histórica.

==================================================
164. EDGE DIFF
==================================================

Alterar somente o necessário em:

supabase/functions/r2-delete-objects/index.ts

e helpers/testes necessários.

NÃO alterar:

r2-presign-upload

r2-presign-download

r2-presign-installation-evidence.

==================================================
165. VALIDAÇÃO DO R2 NORMAL
==================================================

Confirmar que uploads e cleanup já existentes continuam
compatíveis com r2-delete-objects sem deletionAuditId.

==================================================
166. SEGURANÇA
==================================================

Hard delete nunca depende de:

role enviada pelo cliente

actor enviado pelo cliente

allowed enviado pelo cliente

blockers enviados pelo cliente.

Tudo recalculado no servidor.

==================================================
167. DOCUMENTAÇÃO DE MIGRATION
==================================================

No topo da migration incluir comentário:

Evolução OS 2.0 — Fase 4.6a
Order governance / safe permanent deletion.

==================================================
168. PR
==================================================

Criar NOVA PR.

Título:

Fase 4.6a: governança e exclusão segura de OS

==================================================
169. DESCRIÇÃO DA PR
==================================================

### Motivation

Gerentes possuem edição de OS, mas o detalhe moderno não oferece
governança clara para remover uma OS da operação ou excluir
definitivamente registros criados por engano/teste.

O delete legado não cobre as dependências atuais nem limpeza de
storage.

### Changes

- adiciona Mais ações ao detalhe;
- adiciona Arquivar OS;
- adiciona Excluir definitivamente;
- exige motivo e confirmação textual;
- cria preview server-side;
- bloqueia hard delete com retenção financeira;
- cria auditoria independente;
- substitui delete antigo por wrapper seguro;
- remove bypass de delete no Hub legado;
- limpa dependências atuais transacionalmente;
- estende r2-delete-objects para cleanup pós-delete auditado;
- registra status de cleanup R2.

### Financial retention

Hard delete é bloqueado se:

- installment CONCILIADO;
- installment LANCADO;
- PAYMENT_PROOF asset;
- os_payment_proof legado.

### Storage

- banco é excluído transacionalmente;
- R2 elegível é limpo após commit;
- falha R2 fica auditada como PENDING/PARTIAL;
- SMB/local não é apagado automaticamente.

### Safety

- manager/admin only;
- confirmação no servidor;
- motivo obrigatório;
- zero direct delete frontend;
- audit persistente.

==================================================
170. PR COMO DRAFT
==================================================

Criar PR como DRAFT.

NÃO:

mergear.

NÃO:

aplicar migration.

NÃO:

deployar Edge Function.

Depois de criar PR:

PARAR.

==================================================
171. CRITÉRIOS DE ACEITE
==================================================

Só considerar concluído se:

1. gerente vê Mais ações;

2. não-gerente não vê;

3. Arquivar existe;

4. Arquivar exige motivo;

5. Arquivar usa RPC existente segura;

6. Arquivar preserva dados;

7. Excluir definitivamente existe;

8. delete só aparece no detalhe;

9. preview vem do servidor;

10. preview mostra impacto;

11. confirmation é obrigatória;

12. reason é obrigatório;

13. confirmation é revalidada no servidor;

14. gerente/admin é revalidado no servidor;

15. CONCILIADO bloqueia;

16. LANCADO bloqueia;

17. PAYMENT_PROOF bloqueia;

18. os_payment_proof bloqueia;

19. pending finance sem proof não bloqueia indevidamente;

20. instalação é removida;

21. checklist é removido;

22. evidence é removida;

23. delivery é removida;

24. items são removidos;

25. item operations são removidas;

26. assets/jobs são removidos;

27. finance não-retido é removido;

28. flow state é removido;

29. kiosk é removido;

30. installation feedback é removido;

31. old events são removidos;

32. OS é removida;

33. audit permanece;

34. audit não possui FK para os_orders;

35. audit contém snapshot;

36. audit contém counts;

37. audit contém reason;

38. audit contém actor;

39. audit contém R2 keys;

40. delete antigo não é bypass;

41. HubOS legado não exclui mais diretamente;

42. r2-delete-objects normal continua funcionando;

43. r2-delete-objects aceita deletionAuditId;

44. deletionAuditId não permite arbitrary keys;

45. payment proof continua bloqueado no edge;

46. cleanup R2 é registrado;

47. partial cleanup é auditado;

48. retry é possível;

49. frontend diferencia DB delete de cleanup R2;

50. nenhuma limpeza SMB arbitrária;

51. nenhuma outra Edge Function alterada;

52. nenhuma migration antiga alterada;

53. migration nova não foi aplicada;

54. Edge não foi deployada;

55. npm run check passa;

56. npm run test passa;

57. test discovery >= baseline anterior salvo adição esperada;

58. npm run build passa;

59. npm run verify:prod passa;

60. npm run verify:predeploy:edge passa;

61. git diff --check passa;

62. PR permanece DRAFT;

63. PR NÃO foi mergeada.

==================================================
172. ENTREGA FINAL DO CODEX
==================================================

Informar:

- URL da PR;
- número;
- confirmação de DRAFT;
- branch;
- head commit;

- arquivos criados;
- arquivos alterados;

- migration criada;
- nome da migration;

- funções SQL criadas;
- funções SQL alteradas;

- estrutura de os_order_deletion_audit;

- blockers implementados;

- regra de confirmation;

- regra de reason;

- lista completa de dependências removidas;

- estratégia transacional;

- estratégia de R2 pós-delete;

- mudança em r2-delete-objects;

- confirmação de proteção de payment proof;

- comportamento em cleanup parcial;

- alteração feita no HubOS legado;

- comportamento de Arquivar;

- comportamento de Excluir;

- targeted tests;

- total de test files;
- total de tests;

- npm run check;
- npm run test;
- npm run build;
- npm run verify:prod;
- npm run verify:predeploy:edge;
- git diff --check.

Confirmar literalmente:

"A exclusão definitiva é exclusiva de gerente/admin e revalidada no servidor."

"A exclusão definitiva exige motivo e confirmação textual."

"OS com retenção financeira não podem ser excluídas definitivamente."

"O hard delete remove as dependências operacionais atuais em uma transação."

"A auditoria da exclusão sobrevive à remoção da OS."

"O delete legado não oferece mais bypass sem confirmação."

"O HubOS legado não possui mais exclusão definitiva direta insegura."

"A limpeza de R2 pós-delete é vinculada à auditoria da exclusão."

"Comprovantes financeiros continuam protegidos contra exclusão."

"Arquivos SMB/locais não são removidos automaticamente."

"A migration da Fase 4.6a foi criada, mas NÃO aplicada."

"A Edge Function foi alterada no código, mas NÃO deployada."

"PR permanece DRAFT."

"PR NÃO foi mergeada."
