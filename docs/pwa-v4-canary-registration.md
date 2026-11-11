# EvoluSystem PWA V4 — Cadastro piloto restrito

**Status:** preparação de implantação. O Vercel negou leitura e escrita de variáveis
do projeto com HTTP 403 nesta conexão; **nenhuma chave foi criada na Vercel**.
O banco Supabase continua com `generation_enabled=false` e
`delivery_enabled=false`. Nenhum cron está agendado.

## Novo gate no backend

`PWA_PUSH_CANARY_USER_IDS` deve conter **de 1 a 5 UUIDs** reais de
`auth.users`, separados por vírgula, sem texto adicional.
Se a variável estiver ausente, vazia, inválida ou tiver UUIDs repetidos,
`PWA_PUSH_REGISTRATION_ENABLED=true` **não habilita** inscrições.

- A rota `GET /api/push/config` passa a exigir sessão autenticada e
  retornar `enabled=true`/VAPID pública **somente** ao usuário da lista.
- A rota `POST /api/push/subscriptions` revalida o JWT e a lista
  antes de gravar, negando usuários fora do piloto com 403.
- A revogação `DELETE /api/push/subscriptions` continua permitida
  ao proprietário, mesmo fora do piloto ou após desativação.
- A função SQL no Supabase ainda exige acesso ao módulo `hub_os`.
- O frontend envia JWT atual ao consultar configuração. Não há
  `PWA_PUSH_CANARY_USER_IDS` nem credenciais privadas no navegador.

**Atenção:** a lista de IDs é restrição de cadastro, não substitui o
controle de permissões por módulo e destinatário na fila de entrega.

## Passos manuais necessários no painel da Vercel

1. Abrir Vercel > projeto `orcamentos-evolucao` >
   **Settings > Environment Variables**, escopo **Production**.
   A conta conectada aqui recebeu 403 ao tentar criar ou listar as variáveis:
   usar conta proprietária com permissão adequada ou autorizar o conector.
2. Verificar se existem `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
   e `PWA_PUSH_VAPID_*`. Não excluir nem substituir valores existentes
   sem entender a finalidade.
3. Se não houver chaves VAPID permanentes, executar **uma vez** em
   computador confiável, dentro do projeto: `node scripts/generate-vapid.mjs`.
   Copiar a chave pública e a privada **diretamente ao painel Vercel**,
   sem guardar o resultado no repositório, histórico de tickets ou chat.
4. Escolher um endereço de e-mail da empresa que realmente funcione.
   Criar `PWA_PUSH_VAPID_SUBJECT` como `mailto:email@dominio`.
   O programa não inventa esse contato.
5. Definir `PWA_PUSH_CANARY_USER_IDS` com os UUIDs dos 1–2
   primeiros usuários da gestão. Os UUIDs podem ser localizados em
   **Supabase > Authentication > Users**; nunca informar senhas nem tokens.
   Os IDs são dados internos; adicionar diretamente na Vercel.
6. Confirmar `PWA_PUSH_REGISTRATION_ENABLED=false`,
   `PWA_PUSH_GENERATION_ENABLED=false`,
   `PWA_PUSH_DELIVERY_ENABLED=false` e
   `PWA_PUSH_ROLLOUT_ENABLED=false`, todos no ambiente Production.
   Confirmar no Supabase que as flags privadas permanecem false.
7. Como variáveis de ambiente são injetadas no deployment, fazer
   novo deployment autorizado para os valores entrarem em vigor.
   Habilitar `PWA_PUSH_REGISTRATION_ENABLED=true` **somente depois**
   de checar o piloto e autorização específica de ativação; o motor
   continuará desligado no banco e na Vercel.
8. Testar primeiro o cadastro e desativação em um aparelho, sem
   disparar push. Conferir no Supabase apenas a **contagem** de
   inscrições ativas e os registros de erro sem endpoints.

**Não adicionar cron nesta fase.** A entrega com o app fechado exige,
em fase posterior, autorizar o processamento e despacho + registrar o
Vercel Cron; habilitar cadastro **não habilita** geração ou entrega.

## Como checar sucesso, sem expor segredos

- Sem VAPID ou sem lista de canários:
  `GET /api/push/config` responde `enabled:false` para usuário autenticado.
- Usuário fora da lista:
  `GET /api/push/config` responde `enabled:false`, sem chave;
  `POST /api/push/subscriptions` responde 403 sem gravar.
- Usuário da lista, token válido, chave e flag configuradas:
  a central mostra `Ativar notificações`; o navegador
  solicita permissão **só depois do clique**.
- Se houver perda do aparelho ou troca de conta, usar
  `Desativar neste aparelho` e sair do sistema.

**Limitação:** nenhum teste real com aparelho ou escrita de env foi
possível sob a conexão atual. CI garante apenas o contrato de código.
