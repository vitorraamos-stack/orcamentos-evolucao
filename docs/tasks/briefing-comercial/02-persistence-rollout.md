# Briefing Comercial — Etapa 2: persistência (candidata)

## Escopo e situação

Código TypeScript e SQL candidato em branch isolada, sem IA. Não existe
migration aplicada, integração ativa, rota ou mudança de fluxo de OS.
A consulta de catálogo em produção foi somente leitura: o projeto ativo
possui `public.has_module_access(uuid,text)`, perfis comerciais e a RPC
canônica de criação de OS. O projeto de homologação está inativo; não
há branch de desenvolvimento do banco ativa. O executor local não possui
CLI Supabase/PostgreSQL/Docker nem acesso DNS ao GitHub para instalar
dependências. Não gerar um nome de migration manual nem aplicar o
candidato ao projeto ativo.

## Modelo

- `commercial_briefings`: UUID por negociação, consultora autenticada,
  contato/chamado (referências ainda não verificadas), payload JSONB
  versionado, revisão geral/comercial, confirmação futura, OS opcional,
  cancelamento e timestamps.
- `commercial_briefing_revisions`: metadados de eventos CREATED/SAVED/
  CANCELLED, revisão, revisão comercial, ator e instante. Histórico
  deliberadamente não duplica os textos pessoais a cada autosave. Não
  oferece restauração de snapshots. Política de retenção e transferência
  de titularidade ficam para revisão.
- Não há unicidade no contato/chamado: negociações distintas são permitidas.
- A FK/unique para os_orders reserva o vínculo individual; nesta etapa
  nenhuma função cria OS ou define esse campo.
- Os presets de prazo continuam vindo da configuração oficial da OS no
  domínio/frontend; a allowlist SQL espelha apenas seus IDs para validar
  gravações, sem duplicar regras de contagem. Teste estático exige sincronia.
- Limite de 100 itens por negociação e 4 MiB para o JSON textual, além
  dos limites de cada campo. Identificadores Digisac têm limite provisório
  de 200 caracteres; ajustar após validar o contrato real.

## Acesso

RLS e grants de leitura para authenticated; sem DML direto de cliente,
sem acesso anônimo. Funções públicas SECURITY INVOKER encaminham a
funções privilegiadas de propósito limitado em
`commercial_briefing_private`, com search_path vazio, grants explícitos,
auth.uid(), perfis atuais e módulo hub_os. A schema privada **não pode
ser exposta pela Data API**. Conferir isso antes de instalar e revisar
advisors/grants efetivos (inclusive defaults do projeto).

Consultor_vendas (ou legado consultor) acessa seus próprios registros.
Gerente (ou legado admin) pode visualizar todos se tiver hub_os; só
cria/altera registros próprios nesta fase. Não pode alterar o responsável
ou negociar por outro usuário sem uma regra futura de transferência.
Demais papéis e usuários sem o módulo não acessam.
IDs de atores são preservados no histórico sem FK para evitar que
offboarding apague auditoria ou bloqueie a remoção de contas. Retenção
e anonimização precisam de política antes da disponibilização.

## Operações e concorrência

- create: UUID gerado uma vez por tentativa lógica; repetição com o mesmo
  ID/ator/contexto devolve o registro existente sem sobrescrever dados.
- save: SELECT FOR UPDATE, comparação de revisão esperada, validação de
  payload, gravação e evento na mesma transação. Revisão desatualizada
  retorna SQLSTATE 40001; frontend deve recarregar e preservar a edição
  local para reconciliação, sem repetir cegamente.
- save sem diferença não cria revisão. Mudança de termos comerciais
  incrementa revisão comercial e invalida confirmação corrente.
- cancel: marca timestamp e incrementa revisão; não exclui registros.
- A comparação SQL é conservadora e usa JSONB (ignora campos internos e
  data/endereço irrelevantes, mas pode contar mudanças de representação);
  o domínio TypeScript usa serialização normalizada, incluindo rótulos
  atuais de prazo. Antes de habilitar confirmação, harmonizar os dois
  contratos e testar alteração/reversão/conflito. Não existe RPC de
  confirmação nesta fase.

## Camada TypeScript

`commercialBriefingRepository.ts` usa o cliente Supabase existente,
valida input e resposta, mapeia campos e trata conflito/negativa/erro
sem revelar detalhes SQL. Lista por contato em páginas de 50; paginação
por offset e ordenação estável não equivalem a snapshot em tempo real.
Nenhuma rota chama o repositório até o banco ser homologado.

Contexto externo permanece **não verificado** (context_verified_at null).
Criar uma referência não prova a identidade ou autorização no Digisac.
Antes de disponibilizar em iframe, validar instalação, parâmetros,
autenticação, acesso a contato/chamado e escopo de tenant/conta.
Não conceder acesso com base apenas nos parâmetros da URL.

## Validação e implantação

1. Reativar um ambiente isolado aprovado ou executar Supabase local
   descartável com as migrations do sistema. Não usar dados reais.
2. Instalar/verificar CLI, usar `supabase migration new` para gerar
   o arquivo correto; preparar e testar o SQL candidato somente no
   ambiente isolado. Mover para supabase/migrations apenas após revisão.
3. Executar o pgTAP candidato (42 asserções; fixtures e rollback) e
   testes reais de duas sessões concorrentes, incluindo revogação de
   módulo, perfil, acesso anônimo e tentativa de DML direto.
4. Verificar advisors, permissões e schemas da Data API.
5. Executar `npm run verify:prod` (check, Vitest, build); revisar CI.
6. Só depois habilitar interface/autosave; confirmação e conversão
   permanecem bloqueadas até integração verificada e controle transacional.

A checagem estática de 10 invariantes do SQL e contagem das 42 asserções
passou ao ler os arquivos efetivamente gravados no GitHub. Não equivale
a executar PostgreSQL, Vitest ou build. Não há implantação em produção.
