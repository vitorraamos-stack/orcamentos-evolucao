# Briefing Comercial — etapa de domínio

## Estado da entrega

O módulo `src/features/commercial-briefing/commercialBriefingDomain.ts` é
um domínio TypeScript isolado. Não há rota ativa, gravação no Supabase,
integração real com Digisac, IA, criação de OS ou alteração do processo financeiro.

## Contrato funcional

- Cada negociação terá um UUID próprio. O mesmo contato ou chamado poderá
  ter várias negociações; IDs externos não serão chaves únicas de briefing.
- Rascunhos incompletos são válidos para salvamento. Cliente, quantidade,
  prazo e logística não serão inventados. Quantidade vazia é diferente de 1.
- A confirmação comercial exige cliente, itens válidos, necessidade de Arte,
  prazo e logística. O número da venda no Conta Azul e as orientações internas
  para Arte são obrigatórios antes de preparar a OS, não antes da confirmação.
- Campos de item: UUID estável, nome, quantidade, largura, altura, unidade
  de medida (cm/m), descrição/especificação comercial e notas internas.
  As dimensões são opcionais conforme o contrato atual da OS. Campos
  específicos por categoria de produto serão definidos posteriormente.
- Prazo: usa `DELIVERY_DEADLINE_PRESETS` e
  `DELIVERY_DEADLINE_PRESET_CONFIG`, sem tabela paralela. CUSTOM exige data
  válida no formato ISO; os demais presets não geram data no briefing.
  A contagem será responsabilidade do fluxo atual da OS.
- Logística: retirada, entrega, instalação. Endereço obrigatório para as
  duas últimas modalidades. Seleção vazia não assume retirada.
- Arte: usa `ART_DIRECTION_CHOICES` (arte pronta/edição ou criação).
  Urgência permanece separada e não altera o prazo contratado.
- Observações comerciais representam condições comunicáveis ao cliente.
  Notas internas do item e orientações para Arte não entram na confirmação.

## Persistência proposta (ainda não implementada)

`CommercialBriefingRecord` especifica um registro com UUID, consultora,
IDs opacos do contato/chamado, versão do schema, revisões, payload editável,
confirmação, vínculo opcional à OS, cancelamento e timestamps.

Os identificadores Digisac são apenas referências de domínio; ainda é
necessário validar a configuração real, a autenticação e os parâmetros
da integração. Não confiar em IDs vindos da URL do iframe para autorizar
acesso ou identificar a consultora.

O próximo passo deve confirmar a autorização existente e criar uma
migration revisada e testada fora de produção. Exigir isolamento por
usuário/perfil e acesso gerencial conforme regras autorizadas do sistema;
não criar acesso anônimo. O proprietário, revisões, confirmação, vínculo
à OS e datas de auditoria devem ser controlados pelo servidor.

A revisão geral suporta controle de concorrência (comparação da revisão
esperada na gravação). A revisão comercial muda quando os termos
confirmáveis mudam. `getCommercialAgreementKey` serializa os termos,
incluindo o rótulo do prazo oficial, e permite detectar divergências.
Não é um hash, contém dados de cliente e não deve aparecer em URL, logs
ou telemetria. O registro de confirmação deve conter evidência real,
autor autenticado e instante de registro; não basta enviar um booleano.

Mudanças em itens, prazo, cliente, logística ou condições acordadas exigem
nova confirmação. Mudanças exclusivamente internas e inclusão do número
da venda não invalidam automaticamente a confirmação. A comparação é
conservadora: mudanças de representação numérica também podem exigir
nova conferência. As notas internas não devem conter condições negociadas
que precisem de aceite do cliente.

## Pré-preenchimento

`buildCommercialBriefingOrderPrefill` utiliza o contrato
`CreateOrderPrefill` e as validações compartilhadas. Retorna null quando
faltam dados obrigatórios; não cria OS e não autoriza conversão.

As medidas permanecem na unidade digitada para o formulário existente
converter para centímetros uma única vez. O texto de Arte é separado
das observações comerciais por título no campo de descrição, preservando
as informações acordadas; notas de itens vão para o campo de notas da OS.
Os arquivos e comprovantes ainda seguem o fluxo atual da OS.

Na futura conexão com a criação da OS, validar confirmação atual,
autorização, venda aprovada, vínculo e idempotência no servidor. Usar a
RPC existente `hub_os_create_order_secure` ou um fluxo transacional
compatível, sem criar uma segunda OS em caso de repetição. A validação
TypeScript não substitui essas garantias nem RLS.

## Decisões iniciais a revisar

Limites de rascunho: até 100 itens, nome do item até 160 caracteres e
especificação/notas até 4000 caracteres (compatíveis com validação dos
itens da OS), demais limites defensivos no schema. Nenhuma taxonomia nova
de produtos ou regra comercial de datas foi presumida.

## Verificação

O arquivo `commercialBriefingDomain.test.ts` cobre rascunhos vazios,
IDs, campos inválidos, presets, datas, logística, múltiplos itens,
confirmação e conversão de medidas através da função existente.

Executar `npm run verify:prod` (TypeScript, Vitest, build) na branch antes
de avançar à persistência. Não fazer merge nem publicar em produção
antes de homologar a integração.
