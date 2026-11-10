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
