-- Quadro de Arte: remove "Fila de Arte" e "Ajustes" do fluxo novo.
-- Preserva estados anteriores para OS históricas e clientes antigos.
-- Não atualiza nem exclui ordens já cadastradas.
create or replace function public.hub_os_can_transition_art(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (p_from, p_to) in (
    -- Fluxo simplificado.
    ('Caixa de Entrada', 'Em Criação'),
    ('Em Criação', 'Para Aprovação'),
    ('Para Aprovação', 'Em Criação'),
    ('Para Aprovação', 'Produzir'),
    -- Compatibilidade retroativa, sem apresentar novas colunas na interface.
    ('Caixa de Entrada', 'Fila de Arte'),
    ('Fila de Arte', 'Em Criação'),
    ('Para Aprovação', 'Ajustes'),
    ('Ajustes', 'Em Criação'),
    ('Ajustes', 'Para Aprovação')
  );
$$;
