# Controle granular das áreas operacionais

- `hub_os`: acesso à Central de Ordens de Serviço; requisito para Dashboard e quadros.
- `hub_os_dashboard`: Dashboard Operacional (`/hub-os`).
- `hub_os_arte`: Quadro de Arte (`/os/arte*`).
- `hub_os_producao`: Quadro de Produção (`/os/producao*`).
- `/hub-os/kanban` é legado e requer acesso aos dois quadros.
- `hub_os_producao_externa` é distinto do quadro geral de Produção.
- Os módulos autorizam visualização; os cargos continuam governando movimentações.

## Ordem de publicação (requer autorizações específicas)

1. Aplicar `20261110161000_operational_module_permissions.sql` no Supabase.
2. Fazer merge e publicar o código correspondente, somente com autorização.
3. Validar perfil comercial (Central sim, Dashboard/Arte/Produção não) e gerência.
4. Validar menu, URLs diretas e permissões por cargo.

A migração concede as três áreas a gerentes, Arte a arte-finalistas e Produção a produtores e instaladores. Não atribui as três novas permissões a consultores. Não apaga concessões existentes. Nenhuma política RLS é afrouxada. A separação das telas não representa isolamento de registros da Central de OS já autorizados pelo banco.
