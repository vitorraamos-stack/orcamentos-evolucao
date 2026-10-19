# EvoluSystem — Biblioteca Comercial Premium

Mudança **exclusivamente visual e de apresentação do configurador individual**, conforme layout aprovado. A Gestão da Biblioteca continua em `LibraryV28Page.tsx`; a rota `/biblioteca` passa a `LibraryCommercialPage.tsx`.

## Estrutura
- `commercial/LibraryCommercialPage.tsx` — catálogo inicial e seleção de um produto, carregamento exclusivo de `library_publications`.
- `commercial/CommercialProductInfo.tsx` — hero com foto principal, galeria selecionável/ampliação, aplicações, atributos e orientações comerciais.
- `commercial/CommercialConfigurator.tsx` — renderizador dinâmico, grupos e complementos, resumo/status e botões de copiar.
- `commercial/preparation.ts` — avaliação de pendências, condições, formatação individual e cópia ao Conta Azul.
- `commercial/preparation.test.ts` — contratos da formação da descrição.

## Garantias
- Admin continua inalterado: sem alterações nos cadastros, publicações ou banco, e nenhuma migration.
- Permissões de rota permanecem `RequireModule moduleKey="biblioteca_produtos"` e `hubPermissions.canCreateOs`.
- O comercial lê somente snapshots já publicados, não rascunhos administrativos.
- Campos com `visibility="internal"` e complementos internos não entram no formulário nem na cópia.
- Condicionais: pintura -> cor; instalação -> superfície; arquivo vetorial -> oferta de arte. Regras SE→ENTÃO podem gerar orientação, fotografia requerida ou pendência técnica.
- Uma análise técnica pendente continua bloqueando cópia final; copiar rascunho provisório é permitido com observação explícita.
- Seleção de complemento precisa ser condicional e o serviço separado aparece uma única vez.
- Nenhuma precificação, geração de orçamento ou integração automática com Conta Azul.
- Modo escuro e claro herdados dos tokens visuais existentes.
- Sticky apenas em telas grandes, sem rolagem aninhada no configurador; layout de coluna única nas telas menores.
- Fotografias vêm somente da galeria publicada, sem imagens inventadas.
- Seleção local de anexo não representa upload persistente.

## Checklist de homologação visual antes do merge
1. Desktop: catálogo, produto selecionado, imagem principal e zoom.
2. Notebook e celular: ausência de corte horizontal e campos utilizáveis.
3. Formulário incompleto: rascunho copiável e cópia final bloqueada.
4. Preenchimento completo: texto final copiável.
5. Pintura e instalação: campos condicionais aparecendo e sumindo sem dados obsoletos.
6. Serviço adicional: linha comercial única; orientações internas nunca aparecem.
7. Regra técnica: aviso/pendência sem aprovação automática.
8. Gestor: `/biblioteca/gestao` sem regressões.
9. Perfis sem permissão: acesso negado pela proteção de rota já existente.

## Entrega e publicação
Executar `npm run verify:prod` pela CI. Abrir PR **sem merge automático**; publicação posterior apenas mediante autorização específica.
