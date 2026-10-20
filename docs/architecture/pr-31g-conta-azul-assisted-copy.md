# PR 31G — Conferência e cópia assistida para Conta Azul

A etapa 31G adiciona **somente uma prévia de transferência manual** ao
Orçamentista Inteligente existente. O usuário precisa calcular primeiro, revisar
as linhas, confirmar a conferência e clicar em **Copiar para Conta Azul**.

## Contrato financeiro

- Os valores vêm unicamente de `OfficialEstimatePublicResult` validado pela
  API oficial já existente; nada é precificado no frontend.
- Produto, instalação (se solicitada) e munck (se solicitado) ficam em
  **linhas separadas**, sem duplicar o valor dos adicionais.
- O subtotal público deve coincidir matematicamente com a soma dos componentes.
  Uma divergência gera erro fechado e impede copiar.
- Os componentes são exibidos como **valores totais de linha**, nunca como
  preços unitários presumidos; a quantidade do produto fica explícita.
- A diferença exata entre o total final arredondado e a soma das linhas,
  incluindo taxa financeira e arredondamento, fica em um **ajuste separado**.
  O consultor deve verificar como representar esse ajuste no Conta Azul.
- O total reconciliado precisa coincidir com o total oficial ao centavo.
- A confirmação de conferência é reiniciada após alteração dos inputs,
  do produto ou novo cálculo; resultado antigo não habilita cópia.
- O texto orienta o consultor a revisar preços unitários, extras,
  parcelamento e total antes de cadastrar/salvar/enviar qualquer proposta.
- **Sem integração direta ou criação de orçamentos no Conta Azul.**
  Nenhum dado de cliente, valor financeiro interno, fórmula ou custo é enviado.
- Fluxos comerciais existentes, preços e dados reais permanecem intactos.
  Sem migration; sem merge/deploy até autorização separada.

## Casos de teste

Cópia sem adicionais, com instalação e munck separados; ajuste por financeiro
e arredondamento; total reconciliado; bloqueio de divergência de subtotal e
versão de produto; confirmação obrigatória e expiração após alteração.
