# PWA EvoluSystem

## Instalação

- **iOS (Safari)**: abrir o domínio do EvoluSystem > Compartilhar > Adicionar à Tela de Início > Abrir como App da Web > Adicionar.
- **Android (Chrome)**: abrir o domínio do EvoluSystem > menu > Instalar app ou Adicionar à tela inicial.
- A versão instalada usa a mesma URL, login e permissões da versão web; não necessita de loja.

## Segurança e comportamento

- **Online-first**: não há sincronização offline de OS, arquivos ou dados privados.
- O service worker intercepta **apenas navegações** e somente retorna uma página pública de indisponibilidade quando não há rede.
- APIs, respostas autenticadas e arquivos não são persistidos no Cache Storage pelo PWA.
- A aplicação web permanece na Vercel e todas as regras existentes de sessão e permissão seguem inalteradas.
- O navegador verifica atualizações do service worker; atualizações do aplicativo são servidas pela infraestrutura existente na próxima navegação/recarregamento.

## Validação antes de publicar

1. `npm ci && npm run build`.
2. Conferir `/manifest.webmanifest`, `/sw.js` e ícones 192/512/180.
3. Testar instalação em Chrome Android e Safari iOS, login, logout, troca de conta e permissões.
4. Testar recarregamento em rotas internas e fallback sem internet.
5. Testar atualização da aplicação após novo deploy, inclusive com app instalado.
6. Conferir que Cache Storage contém somente `/offline.html` e não possui dados de clientes.

**Não** habilitar armazenamento offline de OS sem planejamento separado de criptografia, validade, revogação e controle de acesso.

## Versão 2 — instalação guiada e atualização segura

- Usuários no navegador móvel podem abrir o menu lateral e tocar em **Instalar aplicativo**.
- No Android, quando disponível, o botão **Instalar agora** usa o prompt nativo do navegador. Caso contrário, exibe instruções manuais.
- No iOS, a instalação é orientada pelo menu Compartilhar → Adicionar à Tela de Início. A API de prompt nativo não é suportada.
- Quando um novo service worker termina de instalar e fica aguardando, o usuário recebe aviso para salvar o trabalho antes de atualizar; o PWA **não recarrega automaticamente** um formulário em edição.
- O botão **Atualizar** envia `SKIP_WAITING` ao service worker, que assume controle e recarrega a página somente após o consentimento. **Depois** fecha o aviso naquela aba.
- O PWA instalado respeita as áreas seguras superiores/inferiores do celular (notch, barra de gestos).
- O cache continua limitado à página pública de falta de conexão e ao símbolo oficial; dados do Supabase e arquivos nunca ficam disponíveis offline.

### Verificações V2

1. Android Chrome: abrir menu móvel, instalar pelo botão, abrir pela tela inicial; verificar que o botão desaparece.
2. iPhone Safari: abrir menu móvel, seguir Compartilhar → Adicionar à Tela de Início; conferir barra superior e área inferior.
3. Com uma OS parcialmente preenchida, disparar uma versão nova e confirmar que o formulário não recarrega até o clique em **Atualizar**.
4. Com duas abas abertas, testar atualização e preservar autenticação/autorização após recarga.
5. Inspecionar Cache Storage para verificar que não há dados privados. Sem rede, apenas a página informativa deve aparecer.

### Detecção de novas versões a cada deploy

O build Vite substitui `__EVOLUSYSTEM_BUILD_ID__` dentro do arquivo final `dist/sw.js` usando o commit `VERCEL_GIT_COMMIT_SHA` ou um identificador de build. Isso altera os bytes do worker a cada release e permite a verificação periódica detectar uma versão nova mesmo quando `public/sw.js` não mudou.


## Versão 3 — navegação mobile e estado de conexão

- Barra inferior com até **4 atalhos autorizados** e botão **Mais** para abrir o menu lateral integral, mantendo o controle por módulo e os guards existentes.
- A primeira seleção segue o fluxo operacional **OS → Arte → Produção → Instalações**; consultoras ou instaladores visualizam apenas as opções liberadas para seu acesso.
- Dentro de uma OS, nos subquadros ou na execução de instalação, o atalho correspondente permanece selecionado.
- A barra não aparece no desktop, respeita a área segura inferior e se oculta temporariamente durante a edição em inputs para não ocupar espaço do teclado virtual.
- Quando o dispositivo está sem conexão, o aplicativo apresenta um aviso não bloqueante. **As ordens de serviço não ficam disponíveis offline.**
- Nenhum módulo, política de acesso ou tabela Supabase foi alterado.

### Validação V3

1. Entrar como consultora, arte-finalista, produção, instalação e gestão; confirmar que os atalhos não revelam módulos sem permissão.
2. Em celular, validar toque de 44px ou mais, item ativo e botão Mais abrindo a gaveta.
3. Criar/editar OS com teclado virtual e verificar que a barra inferior não bloqueia campos nem ações.
4. Desconectar a internet e confirmar aviso visível, sem cache privado.
5. Confirmar que o menu desktop e a navegação das demais páginas permanecem inalterados.
