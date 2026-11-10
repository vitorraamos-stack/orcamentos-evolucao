# Dashboard Operacional — pendências de agendamento por OS

## Incremento posterior ao PR #556

A agenda já apresentava contagens de instalações/entregas sem agendamento e entregas
com registro ativo sem horário válido, mas os cartões levavam a módulos externos.
Este incremento adiciona o detalhamento, **sem novas consultas ou escrita**.

- Os indicadores de instalação, entrega e entrega sem horário abrem a mesma gaveta
  de leitura com o filtro adequado.
- Cada registro exibe OS (número oficial quando disponível), cliente, serviço,
  prazo registrado e link direto à OS. Nunca são inventados horários.
- A lista é ordenada pelo prazo registrado mais próximo; sem prazo vai ao final.
- OS finalizadas/arquivadas e compromissos cancelados ou concluídos não participam
  das pendências. Compromissos ativos são respeitados.
- A contagem de entrega sem horário representa os registros ativos sem data/hora,
  não uma estimativa de OS distintas.
- Para usuários sem visibilidade global de instalações, a contagem permanece
  indisponível e **nenhuma OS desse grupo é incluída** na gaveta. Consultas continuam
  sujeitas a RLS e aos módulos autorizados.
- Agenda completa e seus filtros de Hoje / Próximos 7 dias / Conflitos continuam
  disponíveis na mesma gaveta; a lista de pendências independe do período.
- Foram acrescentados testes para ordenação, consistência das contagens e
  restrições de visibilidade.

## Escopo e liberação

Somente `dashboardAgenda.ts`, `DashboardAgendaPanel.tsx`, teste e documentação.
Sem migrations, alterações do Supabase ou modificações de OS.
A exclusão temporária da branch no `vercel.json` foi retirada após autorização
expressa de publicação. Os demais bloqueios de deploy de branches antigas
permanecem inalterados. A liberação exige CI aprovado no commit final do PR,
merge autorizado e confirmação do deployment da `main` na Vercel.
