# Dashboard operacional — Etapa 2 (Agenda)

**Base:** etapa 1 já publicada; decisões UX/UI 01–44 aprovadas. Implementa a agenda prevista para a Etapa 2, com destaque para as decisões 06, 10, 14, 21, 22, 27–32. Sem autorização para merge, migrations ou deploy.

## Funcionalidades

- Layout do resumo com **prioridades 60% / agenda 40%** em desktop; empilhamento no tablet e celular. Indicadores fixos e fluxo por setores mantidos.
- Agenda compacta com até **cinco eventos** e indicativo de excedentes; compromissos reais de `os_installations`/`os_deliveries` e prazos de `os_orders.delivery_date` sem inventar horários de prazos.
- Períodos exclusivos da agenda: **Hoje** e **Próximos 7 dias** (hoje + seis dias), sempre com calendário `America/Sao_Paulo`. Não altera indicadores, ranking ou fluxo por setores.
- Painel lateral completo (sem edição) preserva período e permite filtrar por tipo, prazos, conflitos e compromissos que ultrapassaram o horário previsto sem conclusão registrada. Busca pelo número oficial da OS, cliente ou serviço; links diretos para a OS.
- Contagens distintas de instalações e entregas aguardando agendamento com base no estado operacional e na **ausência de registro ativo**. Entregas com registro ativo mas sem horário não são transformadas em evento nem tratadas como ausência de registro: recebem indicador separado de horário pendente. A contagem global de instalações aguardando agendamento é omitida para papéis com acesso limitado à própria equipe, evitando falsos alertas.
- Alertas explicativos sobre informações ausentes e conflitos efetivos de instalações com **mesma equipe ou responsável e intervalo explicitamente conhecido** (fim ou duração informada). Sem inferir conflito quando duração é indeterminada e sem reagendar.
- Situação de compromisso passado sem conclusão registrada não significa que o serviço não tenha ocorrido. Estados cancelados/concluídos não geram eventos ativos. Ordens arquivadas e finalizadas não são projetadas como compromisso.
- Consultas somente leitura. Paginação completa + contagem exata + reconciliação limitada em tabelas existentes com RLS; sem alteração de esquema. Permissões dos módulos respeitadas e visibilidade de instalações para não-gerentes limitada a equipes próprias e responsabilidade individual, tal como a tela de Instalações.
- Carga progressiva: indicadores/prioridades/fluxo primeiro; agenda depois. Erros na agenda não apagam os demais dados do Dashboard. Atualização do Dashboard permanece a cada 2 min e sob demanda; resultados de solicitações antigas/abortadas são descartados.
- Branch isolada com o Preview da Vercel desabilitado por `vercel.json`; **remover a entrada da branch antes de merge autorizado**.

## Limites e validação

A agenda é uma leitura consolidada, não um calendário editável. Funcionalidades de preparação operacional e dependências/gargalos de atividades continuam reservadas para as Etapas 3 e 4. Não há novas tabelas, RPCs, migrações ou mudanças em auth/permissões.

Critérios: `npm run check`, `npm run test`, `npm run build:app`; conferir dados reais e perfis diferentes, primeiro carregamento, erros de rede, troca de usuário, conflitos verdadeiros, compromissos cancelados/reagendados, falta de datas e responsividade/tema escuro. Revisão visual e homologação dependem de aprovação separada.
