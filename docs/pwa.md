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


## PWA v4 — Etapa 1 (desenvolvimento isolado, sem migrations)

### Implementado nesta branch

- Central de notificações acessível pelo ícone de sino no mobile e desktop, com contador, histórico dos últimos 14 dias e navegação contextual.
- Seleção por **permissões do perfil** e leitura autenticada sujeita às políticas RLS do Supabase.
- Eventos derivados dos registros de auditoria existentes (atribuições cruzadas com responsáveis atuais, criação conferida contra horário real e liberação conferida contra status atual da OS): `assignee_changed` (somente usuário `payload.to`), `create` (setor Arte) e `status_change` de `arte/art` para `Produzir` (setor Produção).
- Instalações: aviso para responsável, integrante da equipe ou gestor autorizado; reagendamento detectado **enquanto a sessão estiver aberta**, comparando horário/equipe entre consultas.
- Atualização de 60 em 60 segundos mais gatilhos Realtime das tabelas já publicadas e retorno do aplicativo ao primeiro plano. `os_orders_event` **ainda não integra Realtime**, portanto depende de polling.
- Apenas IDs de notificações marcadas como lidas e um instante inicial são guardados em `localStorage` por usuário. **Nenhuma descrição, cliente, arquivo, valor, endereço ou payload de OS é persistido no navegador**. As leituras ainda não são sincronizadas entre dispositivos.
- Service worker preparado para receber Web Push e abrir somente rotas internas autorizadas por whitelist, sem aceitar texto livre nem URL externa. Nenhuma assinatura é criada e nenhuma notificação é enviada nesta etapa.

### O que ainda não está ativo

**Push com aplicativo fechado NÃO está funcional.** Para ativar essa capacidade de forma segura são necessários, sob autorização posterior:

1. Tabela de inscrições por **usuário autenticado e dispositivo**, com RLS, revogação, limpeza de inscrições inválidas e nenhuma chave privada no cliente.
2. Tabela de notificações/outbox com destinatário, evento fonte, estado de leitura, deduplicação idempotente e retenção; autorização por identidade **no servidor** e não pelo payload enviado por clientes.
3. Gatilho/transação servidor para registrar fatos canônicos (nova atribuição, liberação de Arte para Produção, inclusão/reagendamento real de instalação), evitando eventos forjados, tempestades e notificações para usuários sem permissão.
4. Configuração de VAPID (chave pública no cliente; **chave privada apenas em servidor**), envio criptografado de Web Push, autenticação de endpoints, limitação de taxa, processamento confiável e retries.
5. Interface de consentimento explícito em resposta a toque real do usuário, inscrição, desinscrição e revisão das permissões. No iOS o PWA precisa estar adicionado à tela de início.
6. Testes em dispositivos físicos e auditoria de segurança/RLS e dados no bloqueio de tela.

**Nenhuma migration, SQL de escrita, mudança de schema, nova dependência, segredo, envio de push ou alteração de produção foi realizada nesta branch.**

### Cuidados e verificações

- O estado inicial marca eventos históricos como lidos para não inundar os colaboradores no primeiro acesso.
- As notificações são apenas um atalho visual, não substituem os guards das rotas. Uma atribuição removida ou OS arquivada continua sujeita à autorização na abertura.
- Alterações de instalação ocorridas com o PWA fechado não podem ser distinguidas de mudanças de status apenas pela coluna `updated_at`; a detecção histórica fiel dependerá do outbox transacional futuro.
- Ao fazer logout, as consultas Realtime são canceladas. Na futura etapa Push, a inscrição do dispositivo também deverá ser desvinculada de forma segura ao sair.
- Revisar o desempenho do polling e validar os perfis comercial, arte, produção, instalador e gestão antes de publicar.
