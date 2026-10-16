# 19V-C2 — Auditoria da cadeia de autorização

**Somente leitura, outubro de 2026; sem aplicação da 19V-C2.**

A rotina candidata usa `public.has_module_access(auth.uid(),'hub_os')`
e depende indiretamente de `public.is_manager(auth.uid())`
para as políticas de alteração de acessos. A verificação no Supabase
de produção confirmou:

- `has_module_access(uuid,text)`: `SECURITY DEFINER`,
  owner `postgres`, MD5
  `5855f6a54a28a3f37f3c2702a5b0ac82`,
  `search_path=public`, EXECUTE para `authenticated` e não
  para `anon`.
- `is_manager(uuid)`: `SECURITY DEFINER`,
  owner `postgres`, MD5
  `6c4acc49a3edd1a6b8b775f05e1e1e4f`,
  `search_path=public`, EXECUTE para `authenticated` e não
  para `anon`. Consulta o role administrativo na tabela de perfis.
- `user_module_access`: RLS ligada; a política INSERT para
  `authenticated` exige `is_manager(auth.uid())`. Policies
  DELETE/UPDATE também condicionam alterações a gestores.
- `authenticated` não tem CREATE sobre `public`, nem herda
  `service_role`.
- A 19V-C1 continua registrada e a 19V-C2 ainda não foi instalada.

## Defesa adicional proposta

O SQL candidato `docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql`
agora aborta com `19VC2_AUTHORIZATION_DEPENDENCY_DRIFT` quando
essas funções ou a política de atribuição de módulos divergem do
baseline verificado. Isso não cria, substitui nem chama as funções
financeiras. A consulta no arquivo
`phase-19vc2-read-only-authorization-gates.sql` reproduz a
comparação por SELECT, sem mutações.

## Limites: não confundir metadados com teste de sessão

Os checks de catálogo NÃO executam a RPC com JWT, não validam
empiricamente a autorização por usuário, não simulam concorrência,
e não demonstram a configuração do PostgREST. A ausência de
`pgrst.db_schemas` na sessão SQL e de valores configurados em
`pg_db_role_setting` **não prova** quais schemas a API expõe.

A página de configuração deve mostrar de fato que
`evolusystem_finance_private` não consta nos campos
**Exposed Schemas** e **Extra Search Path**. Conferir em
https://supabase.com/dashboard/project/zffpvykekwrmkbyjsgbh/integrations/data_api/settings

**Bloqueado:** converter o candidato em migration aplicável.
Sem autorização e testes transacionais com usuários reais em um
ambiente de homologação compatível, não executar a 19V-C2 em produção.
