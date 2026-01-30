# Remoção manual da Conta Azul (Supabase)

Checklist para limpar o projeto Supabase após remover a integração do código:

1. **Secrets/Env (Supabase Vault/Env)**
   - Remova quaisquer secrets/envs com prefixo `CONTA_AZUL_`.
   - Remova `ADMIN_FUNCTION_TOKEN` se ele era usado apenas para a integração Conta Azul.

2. **Jobs/Automação**
   - Confirme que **não existe** nenhum cron job (pg_cron/pg_net) chamando endpoints de Conta Azul.
   - Apague qualquer job agendado remanescente no Supabase.

3. **Storage/Policies**
   - Verifique se existe algum bucket/policy criado exclusivamente para Conta Azul e remova se houver.

4. **Banco de dados**
   - Rode a migration `supabase/migrations/20260301_remove_conta_azul.sql` para remover tabelas remanescentes.
