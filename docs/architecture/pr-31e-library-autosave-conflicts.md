# PR 31E — salvamento automático e conflito entre administradores

A Biblioteca já tinha CAS (compare-and-swap) de revisão no UPDATE e
trigger `library_products_touch_revision`. Esta etapa reutiliza
essas proteções, **sem migration e sem mudar permissões**.

## Segurança
- O autosave aplica debounce de 1.000 ms após alteração do rascunho.
- O UPDATE é condicionado por `id` + revisão esperada; uma atualização
  concorrente não sobrescreve outra ficha e é identificada explicitamente.
- A resposta do UPDATE devolve revisão e rascunho persistidos no mesmo
  comando. A tela não substitui texto digitado enquanto a requisição estava
  pendente e usa a nova revisão como base para um salvamento seguinte.
- Somente um salvamento fica em voo por editor; mudanças durante esse
  salvamento são enviadas em novo ciclo após sua conclusão.
- Em conflito, **não há mesclagem automática nem nova tentativa**.
  A edição local continua visível e o usuário pode copiar o conteúdo ou
  descartar explicitamente as mudanças para recarregar a versão do servidor.
- Em erro de rede, a edição continua local e o autosave pausa até
  uma nova tentativa manual. O usuário nunca vê sucesso falso.
- Trocas de produto e saída da página com alterações em aberto exigem
  confirmação; enquanto uma operação estiver em voo, impede navegação
  pelo catálogo. Não há persistência offline garantida.
- Publicação, arquivamento e duplicação continuam como ações
  **explícitas**; autosave nunca publica uma versão.
- As ações comerciais e a Biblioteca do consultor não são alteradas.

## Cobertura
Testes de atualização CAS, incremento de revisão, conflito de dois
administradores, mudança de texto durante requisição, falha de rede,
troca de sessão e cópia de alterações. Sem merge/deploy nesta fase.
