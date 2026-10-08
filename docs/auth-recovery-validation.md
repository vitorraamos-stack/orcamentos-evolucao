# EvoluSystem — verificação de recuperação de senha

A implementação utiliza Supabase Auth sem alterações em SQL ou em configurações remotas.

## Pré-requisitos (a validar)
1. Em Supabase > projeto evolucao-orcamentos > Authentication > URL Configuration, conferir o Site URL: https://sistema-evolucao.vercel.app
2. Adicionar nas Redirect URLs: https://sistema-evolucao.vercel.app/redefinir-senha (e Preview URL específica, se o teste ocorrer na prévia).
3. Conferir as configurações de envio de e-mail e SMTP / limites de envio aplicáveis.

## Teste funcional com conta de teste (pendente)
1. Abrir /login, clicar em "Esqueceu sua senha?" e informar e-mail de teste.
2. Confirmar recebimento do link e redirecionamento a /redefinir-senha.
3. Salvar senha nova e conferir acesso com ela; confirmar rejeição da senha anterior.
4. Verificar link expirado, confirmação divergente, e-mail inexistente, e comportamento em celular.

O código existente chama resetPasswordForEmail (Login.tsx) e updateUser (ResetPassword.tsx). O fluxo **não foi validado ponta a ponta**: a presença do código não comprova configuração de Auth, e-mail entregue ou URL autorizada.

## Revisão de impacto deste redesign
- Manter as permissões e rotas existentes.
- Verificar a interface interna com um perfil de comercial e outro de administrador.
- Não houve mudança de banco de dados, API ou funções do Supabase nesta branch.
