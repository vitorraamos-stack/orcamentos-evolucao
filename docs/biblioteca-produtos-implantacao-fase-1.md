# Biblioteca de Produtos — implantação fase 1 (V18–V28)

## Integração

Branch isolada `feat/biblioteca-produtos-foundation-v1`. Esta entrega inicia a implementação real sem criar dados demonstrativos na aplicação e **sem mudar o produto de Engenharia de Custos** (`public.products` / `product_versions`).

- Comercial: `/biblioteca`, lista e consulta **somente fichas publicadas**.
- Gestão: `/biblioteca/gestao`, acessível exclusivamente a gerentes com acesso ao módulo.
- Módulo: `biblioteca_produtos`, concedido pela migration a gerentes e consultores de vendas.
- Banco: `library_products` (rascunhos internos), `library_publications` (projeção comercial sanitizada), `library_product_history` (snapshots das publicações).
- Publicação via RPC transacional com revisão esperada, sem acesso de escrita direta à tabela de publicações.
- Arquivar retira imediatamente a publicação do catálogo; restaurar **não** republica automaticamente.
- Sem valores ou criação de orçamento no Conta Azul.

## Ordem de implantação

1. Revisar migration `20261016224000_library_products_foundation.sql`, privilégios, tipos e políticas RLS.
2. Rodar `npm run check && npm run test && npm run build:app` em ambiente com dependências instaladas; corrigir antes do merge.
3. Aplicar migration no Supabase **somente com autorização específica**, confirmar políticas e privilégios sob diferentes usuários.
4. Liberar PR após revisão, verificações CI e validação da compatibilidade com o deploy.
5. Publicar primeiro um produto real de cada categoria, com os campos e fotos conferidos.

## Escopo entregue nesta primeira parte

Catálogo administrativo, novo produto, alteração e salvamento de rascunho com proteção contra sobrescrita concorrente, campos simples/condicionais, URLs HTTPS de fotos com privacidade por visibilidade, complementos básicos, orientações de consultor e internas, prévia, publicação e arquivamento/restauração. O consultor acessa somente fichas comerciais publicadas.

## A desenvolver (escopo aprovado, não entregar como pronto)

- Upload de fotos com bucket privado e URLs temporárias, ordenação, capa, histórico de mídia;
- regras condicionais completas, modelos globais e herança com proteção técnica no servidor;
- serviços reutilizáveis, validações avançadas e aprovações técnicas externas;
- projetos e rascunhos persistentes multiproduto, instalação conjunta com confirmação e revalidação, transferência assistida ao Conta Azul.
- proteção completa no banco para os contratos de campos e complementos além dos requisitos iniciais de publicação.

A base inicial **não está pronta para uso produtivo sem migration e revisão técnica**. Nenhuma alteração no Supabase é realizada ao abrir esta PR. Evitar disparar múltiplos previews na Vercel; preferir commits consolidados.


## Preflight de compatibilidade — 16/10/2026

Consulta **somente leitura** no projeto Supabase de produção `evolucao-orcamentos`:
- `public.app_modules`, `public.user_module_access` e funções `public.is_manager(uuid)` / `public.has_module_access(uuid,text)` existem.
- As três tabelas `library_*` ainda não existem; a migration não foi aplicada.
- `library_products` fica separada de `products` (engenharia de custos).
- Nenhum módulo `biblioteca_produtos` registrado ainda; a migration o adicionará.
- A configuração atual inclui gerentes e consultores de vendas: conceder apenas aos perfis previstos e testar RLS com credenciais reais antes de uso.
- O Supabase Security Advisor reporta avisos **preexistentes** fora do novo módulo (incluindo funções SECURITY DEFINER e `pg_trgm` em `public`). Não foram introduzidos por esta migration.
- Reforços desta revisão: não permitir publicação sem mudanças, exigir controladores de campos condicionais, proteger cor da pintura e superfície de instalação e rejeitar visibilidades incompatíveis de complementos.
- **Status:** sem execução de SQL mutável; a migration segue pendente de aprovação de aplicação.


## Reforço pós-migration

Aplicar também `20261016224600_library_trigger_execute_hardening.sql`. A função de trigger `library_products_touch_revision()` não precisa ser chamada por clientes via RPC: são revogados os privilégios de execução de `PUBLIC`, `anon` e `authenticated`. O banco continua executando o trigger automaticamente.
