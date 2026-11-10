# Permissões individuais de menu — EvoluSystem

Cada destino visível no menu possui uma chave distinta:
- Operação: `hub_os_dashboard` (Dashboard), `hub_os` (Ordens de Serviço), `hub_os_arte`, `hub_os_producao`, `hub_os_instalacoes` e `hub_os_entregas`.
- Comercial: `orcamentista`, `calculadora`, `biblioteca_produtos`.
- Recursos: `galeria`, `materiais`.
- Administração: `hub_os_financeiro`, `biblioteca_gestao`, `precos_custos`, `regras_operacionais`, `configuracoes` (Usuários).
- Demais funções já existentes: Impressão e Estoque, Aguardando Insumos, Produção Externa, Quiosque.

Atribuição por usuário é independente do cargo. Entretanto, funções administrativas continuam exigindo papel gerente e operações de escrita seguem sujeitas a RPCs/policies de segurança.

## Agenda comercial de Instalações
Conceder **Ordens de Serviço** + **Instalações** à consultora. Ela terá somente a aba Agenda com visualização geral (não apenas instalações atribuídas a ela), nas visões Semana/Lista, com datas, horários, equipe, cliente, status e OS. Não pode abrir execução, agendar, reagendar, cancelar, gerenciar equipes ou otimizar rotas. Executores/gerência mantém suas interfaces atuais.

## Dependências
Os módulos Dashboard, Arte, Produção, Instalações, Entregas e Regras Operacionais exigem `hub_os`. Ao desmarcar a Central de OS, o formulário remove essas permissões relacionadas. O servidor também rejeita combinações inconsistentes.

## Migração e autorização
1. Com aprovação específica, aplicar `supabase/migrations/20261110192000_individual_menu_modules.sql`.
2. Conferir os módulos no catálogo e a migração de permissões dos usuários existentes.
3. Depois de nova autorização, fazer merge e publicar o código.
4. Ativar Instalações especificamente no perfil da consultora comercial (não atribuir a todos os comerciais automaticamente).
5. Validar UI, URLs diretas, consulta de agenda e negativas de escrita em sessão autenticada.

A migration não altera dados de OS, não altera RLS, não atribui automaticamente visão de Instalações a consultores e não interfere no financeiro. O banco hoje já permite SELECT de `os_installations` aos usuários com `hub_os`; a interface será o controle adicional de navegação.
