# EvoluSystem — Concorrência nas operações de Produção

**Status: preparação para revisão. O SQL proposto NÃO foi aplicado no Supabase e o frontend NÃO foi integrado.**

## Diagnóstico somente de leitura
- As operações são gravadas pelas RPCs protegidas `hub_os_update_item_operation_secure`, `hub_os_set_item_operation_status_secure` e `hub_os_delete_item_operation_secure`.
- As funções já verificam papéis (`producao` e gerentes), transições, reaberturas gerenciais, exclusão apenas gerencial, status derivado dos itens e eventos transacionais.
- `os_order_item_operations.updated_at` existe e é atualizado explicitamente nessas RPCs. **Não foi observado trigger automático de updated_at** na tabela. Escritores externos que não renovem a data não estarão protegidos.
- Editar, iniciar, concluir, bloquear, retomar, reabrir e excluir podem partir de versões vistas anteriormente por outro colaborador.

## Etapa A — Banco, somente após autorização separada
1. Confirmar o projeto de produção `evolucao-orcamentos` e conferir assinaturas/permissões das RPCs originais.
2. Gerar uma migration com as três novas funções adicionais propostas em `os-production-operation-concurrency-proposed.sql`. Não substituir nem remover funções anteriores.
3. Instalar após autorização específica, registrar a migration, verificar `SECURITY DEFINER`, `search_path` vazio, `EXECUTE` para `authenticated` e não para `anon`, além dos advisors de segurança.
4. As funções novas validam acesso antes de bloquear a operação, conferem `updated_at` ainda sob bloqueio e delegam à RPC original, incluindo histórico e recomputação, na mesma transação. Em conflito, abortam sem evento de sucesso.

## Etapa B — Interface, após implantação e verificação do banco
1. Revalidar o CI do último commit e o Preview da Vercel.
2. Solicitar **autorização específica para merge do PR**. O cliente falha fechado se não houver RPC de versão instalada — nunca faz fallback para escrita antiga.
3. Verificar o deploy automático em produção; não acionar deployment manual.
4. Validar quando possível em sessão autenticada com dois colaboradores: salvar edição simultânea; bloquear com motivo; concluir/retomar; reabertura gerencial; exclusão concorrente. Observar que edição/bloqueio/exclusão malsucedidos mantêm os diálogos e rascunhos abertos.

## Limites
- Não altera a criação de operações; cada nova operação recebe ID próprio.
- Não reescreve nem enfraquece permissões ou transições das RPCs legadas; consumidores legados que não fornecem uma revisão permanecem fora da nova proteção.
- Não há reconciliação automática de campos e nenhum teste unitário com dados sintéticos equivale a homologação multiusuário.
- A branch deve ser publicada **em um único commit**, limitando os Previews na Vercel.
