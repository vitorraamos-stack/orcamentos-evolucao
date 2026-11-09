# EvoluSystem — Boas-vindas com foto de perfil (2026-11-09)

## Escopo da branch
- Saída do login com sobreposição escura/translúcida, desfoque, foto, saudação por nome e barra animada.
- O efeito acompanha a resolução da rota inicial implementada no PR #559 e encerra em fade após a navegação.
- A gestão pode adicionar, trocar ou remover a foto em **Configurações → Usuários → Editar**.
- O menu lateral do usuário autenticado mostra a foto; sem foto, mantém a inicial.
- Redução de movimentos respeita `prefers-reduced-motion`.

## Dependências e ordem de implantação
1. Revisar e integrar o PR #559 (rota raiz → Central de OS; Calculadora → /calculadora).
2. Revisar a migration `20261109150000_user_profile_avatars.sql` e aplicar ao projeto Supabase correto **antes de ativar uploads**.
3. Integrar esta branch/PR e publicar somente após autorização de release.
4. Para rollback do frontend, o bucket e a tabela novos podem permanecer sem uso. Não remover fotos dos usuários em um rollback simples.

**A migration não foi executada nesta entrega.** Antes da aplicação, avatars seguem em iniciais e o editor apresentará erro de armazenamento, sem comprometer autenticação.

## Segurança
- Bucket `user-avatars` privado, somente WebP até 1 MB.
- Original JPG/PNG/WebP até 6 MB convertido no navegador para imagem quadrada WebP de 320 px; o original não é enviado ao Storage.
- Objeto usa caminho `<user-id>/<uuid>.webp`; RLS do bucket e da tabela permite acesso ao próprio usuário ou gestão.
- Leitura da foto por URL assinada de 30 minutos; URL não persistida no banco.
- Foto substituída apenas após upload + persistência de metadados; arquivo anterior removido depois.
- Sem alteração das regras de módulos, senha, OS ou financeiro.

## Checklist antes de publicar
- [ ] Confirmar com conta gerente: adicionar/trocar/remover foto de colaborador.
- [ ] Confirmar usuário comum: própria foto visível no menu e no login, sem acesso à foto de outros usuários via tabela/bucket.
- [ ] Confirmar login sem foto e login com foto, inclusive em conexão lenta.
- [ ] Confirmar falha do Supabase: fallback de inicial sem travar o login.
- [ ] Confirmar navegação para /os e módulos com acesso limitado.
- [ ] Confirmar recuperação de senha sem sobreposição.
- [ ] Confirmar layout desktop/mobile, Safari/Chrome e redução de movimento.
- [ ] Executar `npm run check` e testes focados com ambiente isolado.

## Não incluído
- Permitir ao colaborador alterar a própria foto por uma página de perfil pessoal (a RLS suporta o caminho, mas ainda não existe formulário dedicado).
- Publicação e execução de migração no Supabase.
