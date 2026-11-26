# Piloto de contexto Digisac — somente gerência

Em 26/11/2026 a gerência confirmou, por captura da tela de produção, a mensagem "API Digisac respondeu com sucesso". Não é necessário recriar ou compartilhar o token.

A rota /integracoes/digisac/briefing recebe contact_id, ticket_id e user_id por URL e rejeita parâmetros vazios, duplicados e expressões não substituídas. O diagnóstico em /api/digisac-context-check exige JWT validado e gerente com hub_os. Lê três recursos do Digisac e retorna nove resultados booleanos/nulos. Nenhum dado de contato ou identificador é retornado pelo diagnóstico.

URL para configurar SOMENTE após CI e deploy aprovados:
https://sistema-evolucao.vercel.app/integracoes/digisac/briefing?contact_id={{contactId}}&ticket_id={{ticketId}}&user_id={{userId}}

CSP frame-ancestors exclusiva da rota piloto: https://evolucaoimpressos.digisac.chat. Sem cache, sem referrer, sem provedores operacionais ou registro de SW na rota. O botão no iframe abre uma janela do EvoluSystem que executa a verificação com a sessão da própria origem. A troca de mensagens valida origem, janela e identificador aleatório da solicitação. A janela recebe as três referências e devolve somente o resultado diagnóstico ou um código de erro. O token da sessão permanece na janela do EvoluSystem e é enviado à API existente. O diagnóstico em aba própria continua disponível quando o navegador bloquear a janela.

Quando contato e chamado aberto conferem, o painel oferece **Consultar briefing**. A consulta abre em aba própria do EvoluSystem, verifica a sessão e as permissões novamente, confirma o contexto no Digisac e faz uma leitura pela política de acesso de briefings. Um único resultado abre em modo somente leitura. Nenhuma ou múltiplas correspondências exibem o estado sem abrir um registro. A comparação de e-mails é informativa. O fluxo mantém as contas independentes e não grava no banco.
