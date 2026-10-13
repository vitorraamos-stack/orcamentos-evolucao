do $$
begin
  if to_regprocedure('public.create_user_by_admin(text,text,text)') is null
     or to_regprocedure('public.delete_user_by_admin(uuid)') is null then
    raise exception 'ADMIN_RPC_HARDENING_ABORTED_MISSING_FUNCTION';
  end if;
end;
$$;

revoke execute on function public.create_user_by_admin(text,text,text)
  from public, anon, authenticated;

revoke execute on function public.delete_user_by_admin(uuid)
  from public, anon, authenticated;

grant execute on function public.create_user_by_admin(text,text,text)
  to service_role;

grant execute on function public.delete_user_by_admin(uuid)
  to service_role;

do $$
begin
  if has_function_privilege('anon','public.create_user_by_admin(text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.create_user_by_admin(text,text,text)','EXECUTE')
     or has_function_privilege('anon','public.delete_user_by_admin(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.delete_user_by_admin(uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.create_user_by_admin(text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.delete_user_by_admin(uuid)','EXECUTE') then
     raise exception 'ADMIN_RPC_HARDENING_ABORTED_UNEXPECTED_PERMISSIONS';
  end if;
end;
$$;
