# Prompt 16C — Arquitetura preliminar de Pricing Persistence

Status: somente projeto; nenhuma migration, SQL executável ou alteração Supabase. Depende dos contratos de 16A e da estabilização técnica de 16B. Não é autorização para implementar/aplicar migration.

## Aggregate e tabelas propostas

| Entidade | Responsabilidade | Integridade prevista |
|---|---|---|
| pricing_policies | Identidade, code, name, description, status e auditoria | UUID; code único; ACTIVE/INACTIVE/ARCHIVED; sem exclusão física |
| pricing_policy_versions | Versão comercial, revision, schema/engine versions, lifecycle, estratégia e publicação | FK policy; UNIQUE(policy_id, version_number); metadata coerente; versão publicada imutável |
| pricing_policy_charges | Encargos por versão | FK version; UUID; kind/base fechados; rate numérica 0<=r<1; alteração somente DRAFT |
| Vinculação produto/política | Seleção oficial futura | Modelo adiado até confirmação da abrangência e cenários reais |
| Snapshots de orçamento | Evidência do preço aceito | Pertencem a Quotes futuro; não criar como efeito colateral de 16C |

A estratégia deve ser discriminada e exigir campos coerentes: margem sobre venda OU markup com base explícita, nunca ambos. Persistir decimal como numeric sem typmod que imponha arredondamento comercial; impor limites compatíveis com runtime por constraints/validação. Transporte usa cast textual decimal, jamais JSON number para valores financeiros. Não reutilizar price_tiers, materials.min_price ou as tabelas legacy.

Persistência single-tenant segue ADR-008; não inventar tenant ou novos roles. created_by/published_by usam profiles como identidade existente. Schema/engine version devem ser interpretados por mapper estrito; incompatibilidade não ganha fallback.

## Lifecycle, concorrência e publicação

Preservar DRAFT→VALIDATING; VALIDATING→DRAFT/PUBLISHED; PUBLISHED→RETIRED. DRAFT é o único estado editável. metadata de publicação ausente nos estados anteriores e obrigatória em PUBLISHED/RETIRED. Não permitir publicação por update genérico com status enviado pelo cliente.

Proposta: uma versão PUBLISHED por policy, através de índice parcial, preservando versões RETIRED. Confirmar abrangência antes do DDL: se políticas por datas/cenários forem necessárias, definir seleção e ambiguidade primeiro; não introduzir silently um calendário comercial.

Optimistic locking: comandos recebem expectedRevision; cada alteração do aggregate, inclusive encargo filho, incrementa revision exatamente uma vez. Bloquear linha pai antes de alterar child ou estado. Child não pode ser editado, movido/reparented ou excluído fora de DRAFT; verificar ambas as versões pai em tentativa de reparenting, preferindo proibi-lo. Triggers não devem duplicar incremento já feito pela RPC.

Publicação valida estratégia, identificação, encargos, bases, somas e denominadores. Como aggregate poderia ser modificado fora da aplicação, invariantes críticas precisam de defesa SQL além do domínio. Congelar a definição VALIDATING e publicar a mesma revision validada. Duas publicações concorrentes não podem vencer; substituição de versão ativa, se aprovada futuramente, deve retirar a anterior e publicar a nova em uma transação, nunca dois requests independentes.

Definir plano de lock ordering para evitar deadlocks: policy → version → children. Exclusões devem ser RESTRICT e obedecer lifecycle; proibir DELETE/TRUNCATE privilegiados onde afetem histórico. Não confiar somente em RLS porque service_role contorna RLS.

## Service boundary e acesso

Gerente/admin segue modelo atual; consultor/anon não leem policies, rates, margin, markup, custos, encargos ou versões privadas. Policy editing e revisão são funções gerenciais. Acesso do cálculo oficial vem do backend com service_role; nunca VITE_* ou segredo no browser.

RLS enabled, revoke grants padrão e conceder apenas operações mínimas. Não conceder DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN sem necessidade explicitamente justificada. Ideal: server RPC estreita + controle de lifecycle no banco, sem privilégios CRUD amplos para consultores. Auditar necessidade de SELECT/INSERT/UPDATE gerencial direta versus API; não copiar grants do legado.

RPCs conceituais: load definition (numeric como texto); create draft; edit draft com expectedRevision; add/update/remove charge com lock pai; transition com semântica e auditoria; archive policy. Nomes e assinaturas só após fechar 16B. Se SECURITY DEFINER for necessário, search_path fixo, schema-qualified objects, revoke PUBLIC, autorização explícita e testes de privilégios. API recebe actorId de sessão autenticada, não de body.

Mapper rejeita rates/margens/markup JSON number e schema desconhecido. Erros de conflito são 409; payload inválido 400; unauthorized 401/403; estado inválido sem detalhe privado conforme caso; incompatibilidade de dados oficiais vira 500 sanitizado. Nenhum raw SQL message, policy definition ou breakdown aparece em resposta de consultor/log.

## Matriz de verificação futura

Cobrir anon/consultor/gerente/admin/service_role separadamente; absence of table/RPC grants; publicação sem readiness; edição de VALIDATING/PUBLISHED/RETIRED; reparenting; delete/cascade/truncate; metadata; revisão stale; conflito concurrent child versus publicação; duas publicações; atomic rollback; rates como texto no transporte; precisão extrema; versões desconhecidas; strict mapping; nenhum acesso legado; nenhum custo em DTO.

Testes TypeScript de mapper/service podem usar mocks. Testes SQL reais requerem ambiente isolado posteriormente autorizado; nenhum teste desta sessão usa produção. Migration local futura é outro escopo; aplicação em produção permanece parada até autorização específica. A mudança deve ter plano de rollback compatível com histórico, sem apagar dados reais.

## Decisões ainda necessárias

Abrangência da política (global/produto/família/cenário), seleção para pagamento/parcela, vigência comercial, escolha explícita de estratégia/base, substituição da versão publicada e modelo futuro de preço final/snapshot. Não armazenar configuração comercial default enquanto Vitor/Marcos não responderem.
