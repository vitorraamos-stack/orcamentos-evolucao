alter table public.os
  add column if not exists is_producao_externa boolean not null default false;

update public.os
set is_producao_externa = false
where is_producao_externa is null;
