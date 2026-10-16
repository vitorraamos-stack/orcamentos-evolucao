# EvoluSystem — Impressão & Estoque (V1)

## Objetivo
Controle operacional simples de bobinas identificadas individualmente e estoque de tintas em mL, sem integração com FlexiPRINT. A unidade de consumo da bobina é metro linear; uma arte individual consome `comprimento (cm) × quantidade / 100`, somada à perda adicional informada em centímetros. A largura da arte precisa caber na largura da bobina.

## Fluxos
- **Impressões:** informar número da OS (`os_orders.sale_number`), material, bobina, largura e comprimento da arte e quantidade. Perda adicional e reimpressão são opcionais.
- **Adesivos:** cadastrar bobina com código automático `B-001`, consultar saldo, copiar dados da etiqueta e ajustar a metragem após conferência, com motivo.
- **Tintas:** registrar entrada em estoque e abastecimento manual de reservatórios. Não há estimativa de tinta por impressão.
- **Histórico:** toda movimentação possui usuário, data, identificador idempotente e quantidade; eventos não são editáveis pelo cliente.

## Segurança\nO `request_id` é acompanhado de um payload canônico: uma repetição idêntica é segura, mas valores diferentes com o mesmo identificador são rejeitados. As baixas podem resolver tanto `sale_number` quanto `os_number`, recusando referências ambíguas.\n
A migration cria `print_inventory_rolls`, `print_inventory_inks` e `print_inventory_events` e o módulo `impressao_estoque`. RLS restringe leitura ao módulo. Não há permissão de INSERT/UPDATE/DELETE para o cliente: alterações ocorrem por RPCs atômicas `SECURITY DEFINER`, com checagem de acesso, bloqueio de linha, saldo não negativo e `request_id` idempotente.

Gerentes recebem o módulo no momento da migration. Demais usuários devem receber a permissão pelo fluxo administrativo existente.

## Ordem para habilitar (não executada pelo PR)
1. Revisar a migration com atenção à matriz de privilégios da base atual.
2. Aplicar em Supabase apenas após autorização explícita.
3. Confirmar a migration aplicada e verificar os privilégios e as políticas RLS antes da liberação.\n4. Liberar módulo `impressao_estoque` aos operadores envolvidos pelo sistema de permissões existente.
5. Homologar com uma OS de teste, cadastrar bobina, imprimir, ajustar saldo e movimentar tinta. Conferir eventos, integridade dos saldos e concorrência entre dois operadores.
6. Fazer merge/publicar somente após validação dos testes e da integração real.

## Limites conhecidos desta primeira entrega
- A OS é validada no servidor pelo campo `sale_number`. Não são aceitos números de OS inexistentes.
- Não há análise de arquivos FlexiPRINT, margens automáticas ou agrupamento lado a lado.
- O código de etiqueta pode ser copiado; layout/driver para impressão física é etapa posterior.
- O estoque de tinta representa frascos/galões disponíveis, não reservatórios já abastecidos.
- O alerta de bobina baixa usa limite visual fixo de 10 metros; parametrização futura.
- Corrigir bobina acima da metragem inicial não é permitido (para entradas extras, criar nova bobina).
- A interface depende da migration: não liberar antes de aplicá-la.
