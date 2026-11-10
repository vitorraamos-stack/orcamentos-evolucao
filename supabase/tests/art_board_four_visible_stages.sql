begin;
select plan(7);

select ok(public.hub_os_can_transition_art('Caixa de Entrada', 'Em Criação'),
  'Caixa de Entrada avança diretamente para Arte em andamento');
select ok(public.hub_os_can_transition_art('Em Criação', 'Para Aprovação'),
  'Arte em andamento avança para Aguardando Aprovação');
select ok(public.hub_os_can_transition_art('Para Aprovação', 'Em Criação'),
  'Arte pode retornar diretamente para andamento');
select ok(public.hub_os_can_transition_art('Para Aprovação', 'Produzir'),
  'Aprovação pode liberar Produção');
select ok(not public.hub_os_can_transition_art('Caixa de Entrada', 'Produzir'),
  'É proibido pular Arte e Aprovação');
select ok(public.hub_os_can_transition_art('Fila de Arte', 'Em Criação'),
  'OS históricas na Fila podem ser concluídas');
select ok(public.hub_os_can_transition_art('Ajustes', 'Para Aprovação'),
  'OS históricas em Ajustes podem ser concluídas');

select * from finish();
rollback;
