# EvoluSystem — OS gerais: concorrência otimista, implantação em duas etapas

**Estado: proposta, sem implantação no Supabase.**

## Contexto verificado (somente leitura)
- O projeto da Evolução possui `public.os_orders.updated_at` e trigger `os_orders_set_updated_at` em toda atualização.
- A função atual `public.hub_os_update_order_secure(uuid,jsonb,text,jsonb)` mantém autorização de `admin/gerente`, valida chaves permitidas, escreve `updated_at` e registra `os_orders_event`.
- Outras partes da aplicação ainda usam essa RPC original; por isso **não removê-la, não alterar sua assinatura e não reescrever sua lógica**.
- A tela de edição geral envia título, descrição, prazo, tipo de logística, endereço, direcionamento de arte e prioridade.

## Etapa A — Banco (requer autorização específica)
1. Confirmar o alvo como projeto Supabase da Evolução. Não operar em projetos pessoais nem criar ambientes isolados.
2. Revisar a versão presente de `hub_os_update_order_secure` e as permissões de seus parâmetros; verificar mudanças desde este PR.
3. Gerar uma migração com o **CLI Supabase** (`supabase migration new <nome>`), usando o SQL proposto em [os-details-optimistic-lock-proposed.sql](./os-details-optimistic-lock-proposed.sql). A proposta ainda não é uma migration aplicada.
4. Inspecionar o novo `SECURITY DEFINER`: autorização com `hub_os_assert_orders_access()`, validação de perfil `admin/gerente`, `search_path` fixado, revogação explícita de `PUBLIC` e `anon`; a auditoria e a validação de campos continuam delegadas à RPC existente.
5. Aplicar **somente após autorização específica** da mudança no banco, mantendo a RPC antiga operacional para outros consumidores.
6. Verificar por metadados, sem alterar dados reais, a assinatura, o retorno `os_orders`, os privilégios e o trigger de `updated_at`.
7. Avaliar advisors de segurança; a nova função `SECURITY DEFINER` será invocável por `authenticated`, mas checará papéis internos. Esse acesso é deliberado e deve ser revisto. Fazer homologação autenticada quando possível, antes de considerar a proteção totalmente validada.

## Etapa B — Aplicação (somente após A)
1. Esperar o GitHub Actions passar e Preview da Vercel ficar READY no PR do cliente.
2. Aprovar e mesclar o PR contendo a UI/repositório; **não mesclar o frontend antes da função estar instalada**, pois ele falha fechado se a RPC não existir.
3. Verificar a publicação automática na Vercel sem deploy manual, respeitando os limites.
4. Inspecionar o cenário: dois colaboradores abrem uma OS, o primeiro salva e o segundo recebe aviso sem perder o rascunho, sem gravação nem evento de auditoria duplicado. Outros fluxos continuam chamando a RPC antiga.
5. Não alegar validação multiusuário real apenas por testes sintéticos.

## Observações
- Esta é uma detecção **conservadora de versão da OS inteira**. Uma alteração de status em paralelo também pode exigir reabrir o formulário de detalhes; não houve tentativa de mesclar alterações automaticamente.
- Atualizações por outros consumidores da RPC antiga continuam possíveis; uma nova edição **na UI** fica protegida contra sobrescrever uma versão anterior. A política mais abrangente para outros escritores será uma etapa separada.
- A nova função não adiciona permissões a colaboradores comuns; `admin`/`gerente` ainda são necessários.
- Rollback: nunca retirar a função enquanto o frontend depender dela. Primeiro reverter o código que a chama; só então avaliar `drop function` da RPC adicional, após autorização.
