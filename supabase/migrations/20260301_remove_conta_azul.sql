-- Remove Conta Azul integration artifacts (manual OS creation only)

drop table if exists public.conta_azul_sales_imports;
drop table if exists public.conta_azul_sync_state;
drop table if exists public.conta_azul_tokens;

drop function if exists public.set_updated_at_timestamp();
