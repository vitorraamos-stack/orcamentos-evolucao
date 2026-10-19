-- EvoluSystem | Biblioteca de Produtos - execução de trigger restrita.
-- A aplicação usa esta função apenas por trigger; nenhuma chamada RPC direta deve ser permitida.
revoke all on function public.library_products_touch_revision() from public, anon, authenticated;
