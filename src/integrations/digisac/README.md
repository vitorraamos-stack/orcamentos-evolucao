# Integração Digisac — Briefing Comercial

## Configuração da instância

- Origem Digisac: https://evolucaoimpressos.digisac.chat
- API v1: https://evolucaoimpressos.digisac.chat/api/v1
- Origem EvoluSystem: https://sistema-evolucao.vercel.app
- Tipo: Contato - barra lateral
- Texto do menu: Briefing Comercial
- URL planejada (rota ainda não habilitada):
  https://sistema-evolucao.vercel.app/integracoes/digisac/briefing?contact_id={{contactId}}&ticket_id={{ticketId}}&user_id={{userId}}

## Transporte implementado

`api/_shared/digisac/readClient.ts` é um módulo exclusivamente de servidor, ainda sem endpoint público consumidor. Permite apenas GET na instância fixada, autenticação Bearer, timeout, sem redirecionamentos, sem cache e respostas JSON limitadas. Os testes usam respostas simuladas.

Rotas documentadas:
- GET /contacts/{contactId}
- GET /tickets?where[contactId]={contactId}

Referências:
- https://www.postman.com/universal-zodiac-965186/digisac/http-request/27349070-164e9da8-da7b-4c30-b0bc-f9fcf24703e0
- https://documenter.getpostman.com/view/24605757/2sA3BhfaDg
- https://digisac.gitbook.io/manual-digisac-2-0/menu-do-usuario/conta/token-e-webhook

A estrutura exata das respostas e a atribuição do chamado ainda precisam de validação autenticada na instância. Não interpretar a listagem de chamados, isoladamente, como autorização.

## Variáveis na Vercel (Production)

- DIGISAC_API_BASE_URL (Config): https://evolucaoimpressos.digisac.chat/api/v1
- DIGISAC_API_TOKEN (Secret): token pessoal gerado diretamente no Digisac.

Não inserir token em GitHub, URLs, logs, prefixos VITE_ ou mensagens de chat. Criar um token com menor privilégio disponível e expiração administrável, e programar sua rotação operacional.

## Gate de ativação

1. Configurar as variáveis de ambiente.
2. Validar, com acesso autenticado e minimização de dados, os formatos reais de contato/chamado e como a API representa o responsável atual.
3. Vincular a identidade do EvoluSystem a um usuário Digisac com uma regra administrada e verificável; a variável user_id recebida na URL nunca prova identidade.
4. Verificar contato, chamado e autorização antes de entregar dados ao navegador ou marcar contexto como verificado. Não disponibilizar respostas integrais da API ao cliente.
5. Criar rota dedicada e compacta, permitir frame-ancestors somente para a origem autorizada do Digisac e revisar autenticação em iframe (incluindo restrições de armazenamento/cookies). Não liberar as demais rotas indiscriminadamente.
6. Executar CI, validar o fluxo autenticado e publicar somente código validado.

Não há envio de mensagens, sincronização em massa, criação de OS, IA ou alteração de banco nesta etapa. O modo manual existente não depende do token.
