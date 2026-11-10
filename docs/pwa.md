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
