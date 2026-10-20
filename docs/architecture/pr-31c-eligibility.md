# PR 31C — Elegibilidade comercial (fail-closed)

API de pré-avaliação comercial no servidor: POST /api/product-commercial-eligibility.
Protegida por bearer, perfil gestor ou consultor autorizado, e módulo Biblioteca.
Usa a publicação comercial vigente via vínculo 31A e adaptador 31B.
Nenhuma migration, alteração de ficha, publicação ou preço.

Resultados públicos: INCOMPLETE, INVALID_COMBINATION, TECHNICAL_PENDING,
PREPARATION_ONLY ou CALCULABLE. Campos "reasons", "missing" e "technicalNotes"
são comerciais. "canTransfer" SEMPRE false nesta etapa.

CALCULABLE significa exclusivamente "pode tentar calcular no motor oficial".
Não significa que a disponibilidade de todas as tarifas foi verificada, nem que
um preço foi produzido ou autorizado para transferência ao Conta Azul.
O cálculo definitivo, suas taxas e o controle de vigência continuam
inteiramente no motor oficial. Não reutilizar o resultado como autorização.

Regras conservadoras do primeiro produto (LETREIRO_PVC):
- Medidas positivas do conjunto, quantidade inteira positiva, espessura das
  opções publicadas e reconhecida na engenharia publicada;
- Acabamento "PVC natural branco", arte vetorial já disponível, sem
  instalação, fixação especial nem complemento não precificado;
- Dimensões comerciais convertíveis para m; nenhuma entrada técnica obrigatória
  desprovida de parâmetro administrado pelo servidor;
- Número de cores só é considerado zero se a própria engenharia publicada
  declarar este valor como default;
- Contexto publicado de Pricing necessário para status CALCULABLE, sem expor
  taxas, custos, fórmulas ou valores ao navegador;
- Pintura, instalação, vetorização, itens adicionais, versões desatualizadas,
  produtos ainda não mapeados => PREPARATION_ONLY, exceto quando a ficha
  exigir TECHNICAL_PENDING ou quando o preenchimento estiver incompleto/inválido;
- Falhas desconhecidas de precificação resultam em erro, não em "CALCULABLE".
- Nada é atualizado automaticamente após mudança de publicação.

Precedência dos bloqueios: INCOMPLETE > INVALID_COMBINATION >
TECHNICAL_PENDING > PREPARATION_ONLY > CALCULABLE.
Não alterar a interface /orcamentista existente neste PR.
Sem merge, migração ou deploy manual sem autorização separada.
