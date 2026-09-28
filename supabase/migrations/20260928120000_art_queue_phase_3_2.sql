-- Evolução OS 2.0 — Fase 3.2: add the real Art queue step without renaming data.
create or replace function public.hub_os_can_transition_art(p_from text, p_to text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select (p_from, p_to) in (
    ('Caixa de Entrada', 'Fila de Arte'),
    ('Fila de Arte', 'Em Criação'),
    -- Temporary legacy debt: /hub-os/kanban still moves directly into creation.
    ('Caixa de Entrada', 'Em Criação'),
    ('Em Criação', 'Para Aprovação'),
    ('Para Aprovação', 'Ajustes'),
    ('Para Aprovação', 'Produzir'),
    ('Ajustes', 'Em Criação'),
    ('Ajustes', 'Para Aprovação')
  );
$$;

-- Helper is server-internal. Replacing it must not restore PostgreSQL's PUBLIC grant.
revoke execute on function public.hub_os_can_transition_art(text, text)
  from public, anon, authenticated;
