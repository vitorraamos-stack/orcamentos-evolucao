# EvoluSystem — Proteção de reagendamento de Instalações

**Estado: proposta. Nenhuma migration aplicada ao Supabase, nenhum merge, nenhum deploy.**

## Diagnóstico em produção, somente leitura
- `public.os_installations.updated_at` é obrigatório.
- `hub_os_reschedule_installation_secure` verifica acesso gerencial, status `SCHEDULED`, disponibilidade da equipe, regras de validação e registra `INSTALLATION_RESCHEDULED` no histórico. Ela atualiza `updated_at`, mas não recebe a revisão observada pelo gestor.
- O formulário de reagendamento não inicializava a duração estimada da instalação atual: abria em `120` minutos e podia sobrescrever outro valor.
- O formulário não mostrava erro dentro do diálogo quando o salvamento falhava.

## Mudanças propostas
- **Uma nova RPC** `hub_os_reschedule_installation_if_current` valida permissão, obtém o bloqueio da instalação, compara `updated_at` exato e chama a RPC de reagendamento existente na mesma transação.
- O repositório envia `editing.updated_at`, sem fallback para a função legada em caso de conflito ou função ausente.
- A interface inicializa corretamente a duração de um reagendamento, mostra erros acessíveis, mantém os valores digitados em conflito e bloqueia o fechamento apenas enquanto salva.
- Agendamento de instalação nova, início, conclusão, cancelamento, evidências, equipes, rotas e status permanecem intactos.

## Implantação em duas etapas, sujeitas a autorizações
1. Autorizar explicitamente a aplicação do SQL proposto em `docs/tasks/os-installation-reschedule-concurrency-proposed.sql` no Supabase `evolucao-orcamentos`.
2. Validar nome e assinatura, `SECURITY DEFINER`, `search_path` vazio, `anon EXECUTE=false`, `authenticated EXECUTE=true`, comparador de versão, linha bloqueada e função anterior inalterada; registrar a migration efetiva em GitHub, em um único commit se possível.
3. Verificar CI do último commit, Preview somente se necessário e pedir autorização específica para o **merge** na `main`. Não acionar deploy manual.
4. Homologação funcional autenticada com dois gestores permanece pendente; não realizar alterações em OS reais como parte dos testes sintéticos.

## Limitações
- Não protege agendamentos novos nem operações de status/checklist; tampouco escritores legados que alterem linhas sem renovar `updated_at`.
- Ainda não há trigger genérico de `updated_at` identificado para `os_installations`; as funções de reagendamento atuais o renovam explicitamente.
- A proposta mantém o sistema **falhando fechado** enquanto a nova RPC não estiver disponível, portanto o PR não pode ser integrado antes da autorização e aplicação do SQL.
