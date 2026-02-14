alter table public.os_orders
  drop constraint if exists os_orders_production_tag_check;

update public.os_orders
set production_tag = null
where production_tag is not null
  and production_tag not in (
    'EM_PRODUCAO',
    'PRONTO',
    'AGUARDANDO_INSUMOS',
    'PRODUCAO_EXTERNA'
  );

alter table public.os_orders
  add constraint os_orders_production_tag_check
  check (
    production_tag is null
    or production_tag in (
      'EM_PRODUCAO',
      'PRONTO',
      'AGUARDANDO_INSUMOS',
      'PRODUCAO_EXTERNA'
    )
  );
