begin;
select plan(3);
select ok(public.hub_os_can_transition_art('Caixa de Entrada', 'Fila de Arte'), 'Arte accepts Caixa -> Fila');
select ok(public.hub_os_can_transition_art('Fila de Arte', 'Em Criação'), 'Arte accepts Fila -> Em Criação');
select ok(not public.hub_os_can_transition_art('Fila de Arte', 'Para Aprovação'), 'Arte rejects Fila -> Para Aprovação');
select * from finish();
rollback;
