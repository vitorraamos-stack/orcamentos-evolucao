# EvoluSystem — Homologação funcional da tela de detalhes da OS

**Data:** 15/10/2026  
**Status:** testes automatizados em GitHub CI + roteiro manual **pendente** de execução com sessão autenticada e dados de homologação.

## Escopo e limites

Este roteiro cobre as sete abas: Resumo, Itens, Produção, Instalação / Entrega, Arquivos, Comentários e Histórico. Os testes automatizados usam **dados sintéticos**, avaliam renderização, regras puras, permissões visuais e contratos com os serviços; **não** representam navegação completa em navegador autenticado, verificação de dados reais ou escrita em Supabase. Não executar mutações em OS de cliente/produção para realizar esta homologação.

### Pré-condições para homologação real

- Abrir a **Vercel Preview do PR**, não a produção. Verificar ambiente, login e se a prévia compartilha ou não a base de produção: a URL de preview por si só **não garante isolamento de dados**.
- Usar **OS fictícia isolada** em ambiente de teste comprovadamente separado (RLS, storage, RPCs e integrações), com permissão apropriada para cada papel.
- Criar dados de teste próprios: um item, uma operação, uma instalação e entrega simuladas, comprovante de teste sem dados financeiros ou pessoais, um comentário e um evento de histórico.
- Validar com perfil gerente e usuário operacional/leitura, em desktop e celular. Conferir console, feedback e erro de rede.

## Roteiro por aba

| Aba | Verificação autenticada | Resultado esperado | Estado |
| --- | --- | --- | --- |
| Resumo | Abrir OS de teste, alterar responsável/prazo com perfil autorizado e conferir após recarregar | Dados persistidos; quem não tem permissão não altera; informações não duplicadas em outras abas | **Pendente** |
| Itens | Criar, editar, reordenar e remover item de teste; tentar dados inválidos | Ordem persistida, validação informativa e ausência de acesso indevido | **Pendente** |
| Produção | Criar operação, iniciar, bloquear com motivo, retomar e concluir, com papéis distintos | Transições e permissões corretas, erros claros, sem duplicar ação | **Pendente** |
| Instalação / Entrega | Abrir instalação, entrega e retirada fictícias; simular atraso e erro de carregamento | Loading, status, checklist, evidências, rastreio e tentativa novamente corretos | **Pendente** |
| Arquivos | Abrir arquivo sintético permitido e tentar acesso com usuário sem permissão | URL de acesso autorizada; nenhum caminho interno exposto; sem expor documentos reais | **Pendente** |
| Comentários | Publicar comentário de teste e verificar sem recarregar; editar/remover como autor e gerente; forçar erro | Comentário aparece na hora, sem duplicação; rascunho preservado no erro; permissões corretas | **Pendente** |
| Histórico | Executar mudanças em OS fictícia e observar eventos correspondentes | Autoria, data e ordem decrescente corretas; sem perda de eventos | **Pendente** |

## Critérios de aceite

1. Todos os sete cenários manuais realizados sem perda de dados ou desvio de permissão.
2. Falhas de API e redes lentas não podem ser exibidas como listas vazias ou dados inexistentes.
3. Responsividade e acessibilidade conferidas em desktop e celular; ações destrutivas exigem confirmação.
4. Todos os logs e eventuais falhas são registrados com o resultado e os passos para reproduzir.
5. Somente depois disso considerar **homologação funcional real concluída**. A aprovação de CI/Preview indica **validação automatizada**, não homologação real.

## Ações futuras sugeridas

- Priorizar teste de falha de criação/edição nos modais de Itens, para assegurar preservação dos dados digitados.
- Avaliar indicação explícita de erro/carregamento de Produção durante consulta assíncrona.
- Se desejado, acrescentar E2E com Playwright em ambiente de teste autenticado e isolado, usando segredos não expostos no repositório, para automatizar o roteiro.
