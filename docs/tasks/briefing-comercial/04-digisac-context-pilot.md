# Piloto de contexto Digisac — somente gerência

Em 26/11/2026 a gerência confirmou, por captura da tela de produção, a mensagem "API Digisac respondeu com sucesso". Não é necessário recriar ou compartilhar o token.

Próxima entrega: rota /integracoes/digisac/briefing (piloto, não editor). Recebe contact_id, ticket_id e user_id por URL; rejeita parâmetros vazios, duplicados e expressões não substituídas. A API /api/digisac-context-check exige JWT validado e gerente com hub_os. Faz somente GET dos três recursos fixos, com o cliente existente. Retorna exclusivamente nove booleanos/nulos, sem expor PII, IDs ou respostas integrais. Não grava dados nem prova autorização de atendimento. Formato da instância ainda precisa ser verificado.

URL para configurar SOMENTE após CI e deploy aprovados:
https://sistema-evolucao.vercel.app/integracoes/digisac/briefing?contact_id={{contactId}}&ticket_id={{ticketId}}&user_id={{userId}}

CSP frame-ancestors exclusiva da rota piloto: https://evolucaoimpressos.digisac.chat. Sem cache, sem referrer, sem provedores operacionais ou registro de SW na rota. Nenhuma sessão é transmitida via URL, postMessage ou token do Digisac. Caso o navegador particione o armazenamento, abrir o diagnóstico em aba própria e registrar a limitação de sessão do iframe. Não inserir credenciais dentro do iframe nesta etapa.

O retorno não permite assumir que user_id é autenticado nem autorizar acesso a cliente. A comparação de e-mail confirmado é diagnóstico, não associação definitiva. O próximo passo depende do teste de uma conversa real em aberto e da definição de vinculação administrada dos usuários. Sem IA, sem nova homologação, sem criação automática de OS.
