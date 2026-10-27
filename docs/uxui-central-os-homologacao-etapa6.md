# EvoluSystem — Central de OS: homologação UX/UI (Etapa 6)

**Data de referência:** 26/10/2026  
**Status:** **NÃO HOMOLOGADO / PRODUÇÃO BLOQUEADA**  
**Escopo:** exclusivamente a Central de Ordens de Serviço e seus links de retorno; não autoriza alterações em outros módulos.  
**Origem:** especificação mestre aprovada (153 decisões).  
**Fonte financeira oficial:** Conta Azul. Sem migrações, escrita de dados reais, alteração de permissões ou integração financeira.

## Evidências disponíveis

A CI da branch pode comprovar apenas **TypeScript, testes automatizados e build**. Testes de texto-fonte e renderização estática são barreiras de regressão, **não equivalem** à validação em navegador, com autenticação, leitor de tela, zoom ou volume real. Registrar nesta matriz o SHA, a execução de Actions e quem verificou cada cenário.

| ID | Cenário | Critério de aceite obrigatório | Situação |
|---|---|---|---|
| H01 | 320px CSS / reflow 400% e zoom 200% | Indicadores e filtros funcionais; nenhuma perda de conteúdo/ação nem rolagem horizontal da página, ressalvadas tabelas bidimensionais | Pendente: navegador real |
| H02 | iPhone/iOS Safari e Android/Chrome | Painel inferior abre, rola, aplica/cancela rascunhos; alvos de toque apropriados | Pendente: dispositivo real |
| H03 | Somente teclado | Tab, Shift+Tab, Enter, Escape; ordem de foco previsível, sem armadilhas | Pendente: navegador real |
| H04 | Leitor de tela (NVDA/VoiceOver) | Filtros identificados; contagem/erros anunciados uma vez; foco acessível restaurado | Pendente: auditoria assistiva |
| H05 | Contraste, foco e redução de movimento | WCAG 2.2 AA incluindo temas claro/escuro, foco sempre visível e sem dependência exclusiva de cor | Pendente: medição/auditoria |
| H06 | Indicadores independentes | 3 KPIs globais; erro de um não apresenta zeros falsos nem oculta o outro | Pendente: rede simulada |
| H07 | Pesquisa e filtros | Debounce 350ms; rascunho isolado; novas intenções invalidam resultados antigos | Pendente: navegador / latência |
| H08 | Ordenação e paginação | Classificação global antes das páginas de 25, contagem coerente e recuperação da última página válida | Pendente: dados representativos |
| H09 | Consistência concorrente | No máximo uma reconciliação automática; não misturar páginas, contagens, pesquisas ou respostas antigas | Pendente: teste concorrente |
| H10 | Retorno inteligente | Mantém filtros, acha OS em nova página autorizada, foco correto uma única vez | Pendente: navegador/usuário |
| H11 | Limite e resposta tardia | Lookup termina no limite configurado; resposta tardia não move página/foco; fallback seguro | Pendente: rede simulada; testes unitários disponíveis |
| H12 | Recuperação de erro | Retry independente, foco recuperado, informação indisponível não vira zero/resultado vazio | Pendente: testes assistivos |
| H13 | URL e histórico | Back/Forward, links diretos, F5, múltiplas abas e parâmetro quick explícito preservam a precedência aprovada | Pendente: navegador real |
| H14 | Permissões revogadas | Dados e destaque da OS não reaparecem após mudança de sessão ou acesso; sem vazamento de existência de OS | Pendente: perfis de teste autorizados |
| H15 | Sem efeito em módulos vizinhos | Sem regressões em Arte, Produção, Instalações, Financeiro, login, OS detalhe e regras operacionais | Pendente: regressão integrada |
| H16 | Performance | Medir p50/p95, largura de banda e quantidade de registros; validar timeout provisório de 5s sem suposição de SLA | Pendente: volume real |
| H17 | Segurança financeira e integrações | Conta Azul continua fonte oficial; nenhum write financeiro, migration ou ampliação de privilégio | Pendente: revisão de impacto |
| H18 | Rastreabilidade e decisão de release | Evidências por requisito, responsáveis e datas; falha crítica bloqueia aprovação; merge/publicação dependem de autorização específica | Pendente: decisão de liberação |

## Bloqueadores e riscos antes de merge/publicação

1. **Homologação real H01–H18:** os itens acima não estão aprovados apenas pela CI.
2. **Performance da leitura global:** a Central busca lotes de IDs para ordenar o conjunto filtrado antes de trazer a página de 25; mensurar custo/latência com volume autorizado. Não assumir escalabilidade.
3. **Consistência transacional:** múltiplas leituras RLS do Supabase não formam uma snapshot transacional. A reconciliação atual detecta algumas mudanças, não todas.
4. **Histórico/retorno:** testar Back/Forward, reentrada em detalhes, novas abas e recuperação após erro. O contexto temporário em sessionStorage não substitui histórico nativo.
5. **Autorização:** confirmar revogação durante navegação, sessão trocada e acesso diferenciado; preservar integralmente as regras existentes.
6. **Acessibilidade:** testes unitários garantem nomes e estrutura, não comprovação WCAG 2.2 AA. Realizar auditoria com teclado, NVDA/VoiceOver e viewport reduzido.
7. **Tempo de retorno:** os 5 segundos são parâmetro inicial de desenvolvimento; validar limiar e duração total do fallback com medições.

## Registro de execução

Preencher para cada cenário: **executor; ambiente; navegador/dispositivo; usuário de teste; data; SHA; resultado; link para evidência; problema; correção e revalidação**.

**Gate de release:** nenhuma falha crítica em segurança, autorização, dados, integridade, acessibilidade essencial ou regras operacionais. Refinamentos cosméticos podem permanecer documentados se não afetarem requisitos obrigatórios. Nunca usar aprovação de CI como autorização automática de merge, migration ou publicação.
