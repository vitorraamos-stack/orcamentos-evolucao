# Briefing Comercial — interface interna e salvamento automático

## Entrega

- Rota interna /briefing-comercial, sob RequireModule hub_os e HubOsAccessGuard create, com item no menu Comercial apenas para os perfis autorizados.
- Formulário compacto responsivo e reutilizável, com seções Itens, Arte, Prazo e logística, Resumo. Utiliza os componentes e a configuração de prazos/arte existentes. Produtos são identificados por nome livre nesta etapa, sem sincronização automática com a biblioteca.
- Consulta por ID de contato informado manualmente, chamado opcional, múltiplas negociações e leitura gerencial. Registros de terceiros, convertidos ou cancelados são somente leitura.
- Persistência pelo cliente Supabase autenticado, com um salvamento em voo por editor, debounce de 850 ms, revisão esperada e retenção das alterações digitadas durante uma gravação. Em conflito ou falha, não sobrescreve nem repete automaticamente. Recarregamento e descarte de edições locais exigem ação deliberada.
- Prévia comercial determinística; prazo oficial, itens, medidas, endereço aplicável e observações comerciais. Notas internas, instruções internas de Arte, prioridade interna e número da venda ficam fora. Copiar requer uma versão salva; não envia mensagem nem registra aceite.

## Produção e verificação

A migração de persistência 20261126200752 foi aplicada diretamente no projeto ativo, conforme orientação de não criar homologação. O histórico SQL está versionado com o mesmo número. Consultas de catálogo confirmaram RLS e grants; a rotina de pré-commit validou formato/termos e privilégios. A consulta posterior confirmou ambas as tabelas vazias, ausência de ator sem autenticação e grant de execução da RPC para authenticated. O Security Advisor não retornou lints dos objetos de briefing. Isso não substitui teste ponta a ponta autenticado nem teste concorrente real.

CI da etapa de domínio/persistência e do registro da migration concluído com sucesso. Os novos testes de resumo e limites de rota são unitários/estáticos; conferir o CI do último commit antes do merge. Não inserir fixtures na produção para simular clientes.

## Integração Digisac: bloqueios intencionais

O modo desta etapa é interno/manual. IDs informados não comprovam identidade do contato, atendimento ou autorização na plataforma Digisac. Não ler parâmetros de URL como contexto confiável nem liberar o app inteiro para iframe.

A documentação oficial (https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/integracoes) confirma o tipo Contato - barra lateral, URL de iframe e variáveis dinâmicas. É necessário obter a origem exata da conta, o contrato de variáveis e a configuração da API da instância; validar identidade e autorização do contexto no servidor antes de habilitar a rota de iframe. Credenciais devem permanecer em variáveis server-side protegidas; nunca em URL ou browser.

## Próximas verificações

- Após CI do frontend, validar com sessão de consultora e gerente, uma negociação real autorizada, recuperação, concorrência entre duas janelas, modo estreito e cópia do resumo.
- Definir vinculação do contato e do usuário Digisac ao EvoluSystem, CSP frame-ancestors limitada à origem autorizada e estratégia de autenticação no iframe.
- Implementar registro da confirmação com evidência e revisão, depois conversão idempotente em OS no fluxo existente. Nenhuma ação cria OS ou altera o financeiro neste estágio.
- Sem IA e sem ambiente de homologação separado. Não publicar uma versão com falha de CI.
