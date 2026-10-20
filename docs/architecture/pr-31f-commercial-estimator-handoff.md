# PR 31F — handoff comercial para Orçamentista

**Fluxo único, sem duplicar telas:** Biblioteca de Produtos publicada →
verificação autenticada da associação canônica + elegibilidade de servidor →
Orçamentista existente, com campos compatíveis preenchidos automaticamente.

- No endpoint de leitura 31B, um segundo parâmetro opcional exclusivo
  `libraryProductId` permite resolver o vínculo 31A no backend; a mesma
  autorização e sanitização são preservadas. `productId` continua válido.
- A verificação 31C é executada **sob demanda**, a cada acionamento,
  comparando produto, publicação, versão de engenharia e IDs entre respostas.
- Apenas status `CALCULABLE`, sem complementos, sem instalação, sem pintura
  e com arte vetorial autorizada pode avançar; todos os demais permanecem na
  Biblioteca, com o motivo da indisponibilidade.
- A transferência de valores é **de sessão em memória e uso único**, sem
  criar pedidos, inserir registros ou armazenar dados na URL/storage.
  Perde-se ao recarregar a aba, de propósito.
- A tela de Orçamentista relê seu formulário oficial e confere produto,
  versão e opção de espessura contra a engenharia vigente. Somente medidas,
  espessura e quantidade são preenchidas; financiamento e extras permanecem
  nos controles oficiais. Não acontece cálculo nem transferência automática.
- Se a engenharia foi atualizada, o token da sessão mudou, a versão deixou
  de estar disponível ou os campos divergiram, descarta-se o handoff e
  permanece o preenchimento padrão seguro.
- O cálculo continua uma ação explícita e exclusivamente pela API existente,
  com precificação oficial e validações novamente executadas no servidor.
- A cópia de rascunho/final do fluxo comercial existente permanece independente.
- Sem migração, alteração de preços, nova modalidade, histórico financeiro
  ou mudança na integração Conta Azul.
- **Sem merge ou publicação em produção nesta etapa.**
