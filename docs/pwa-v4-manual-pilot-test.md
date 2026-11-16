# EvoluSystem — Push V4: teste manual de um único dispositivo piloto

**Status: preparação técnica, sem migração aplicada, merge, deploy ou envio real.**

## Objetivo
Permitir que a conta já cadastrada no piloto solicite, pelo botão **Enviar teste neste aparelho**, uma notificação Push com texto fixo, sem criar uma OS, eventos operacionais, jobs automáticos ou notificações para terceiros. O teste utiliza a inscrição do aparelho no navegador, nunca um endpoint arbitrário fornecido pelo usuário.

## Barras de segurança
- Um **POST** explícito em `/api/push/pilot-test`, após confirmação do usuário. Acessos `GET`, sem sessão ou de usuários fora de `PWA_PUSH_CANARY_USER_IDS` são negados.
- Nova variável de servidor `PWA_PUSH_PILOT_TEST_ENABLED`, **desativada quando ausente**. Não utilizar `VITE_` ou `NEXT_PUBLIC_`.
- Exige `PWA_PUSH_REGISTRATION_ENABLED=true`, par VAPID correspondente e conta verificada no Supabase. Não altera `PWA_PUSH_GENERATION_ENABLED`, `PWA_PUSH_DELIVERY_ENABLED` ou `PWA_PUSH_ROLLOUT_ENABLED`.
- A consulta ao banco confere o UUID autenticado, hash do endpoint inscrito, revogação, atividade recente e acesso a `hub_os`. Apenas a função service-role `push_v4_claim_pilot_test` tem acesso à inscrição.
- Limite atômico por usuário: intervalo mínimo de **2 minutos** e até **5 solicitações por janela móvel de 24 horas**. Erro ou rejeição do provedor também consome uma tentativa.
- Payload cifrado `{kind:"pilot_test"}`. O Service Worker exibe frase fixa e navega somente para a página inicial, sem número de OS, nome de cliente, preço, rota arbitrária ou conteúdo originado do navegador.
- Resposta da API distingue **aceite pelo provedor** de **recebimento no dispositivo**; não afirma que a notificação apareceu até conferência física.
- Nenhum cron novo e nenhuma liberação de envio operacional.

## Ordem de implantação futura — exige aprovação distinta
1. Conferir CI e revisão de segurança deste PR.
2. Aplicar migration `20261116150000_pwa_v4_manual_pilot_test.sql` no Supabase e conferir grants e contadores; **não aplicar nesta fase de preparação**.
3. Fazer merge e publicação, mantendo `PWA_PUSH_PILOT_TEST_ENABLED` ausente ou `false`, e todas as flags operacionais `false`.
4. Para habilitar o botão apenas na conta piloto, o proprietário deverá cadastrar na Vercel, escopo **Production**, a variável `PWA_PUSH_PILOT_TEST_ENABLED=true`, e realizar novo deploy autorizado. O conector Vercel não tem permissão de env (403); não enviar chaves ou segredos ao chat.
5. Confirmar inscrição ativa, clicar no botão e confirmar manualmente. Somente então a API tentará um envio; nenhum envio automático será ativado.
6. Conferir no aparelho a entrega real e o clique para abertura da aplicação. Para testar **app fechado** com confiabilidade, acionar o teste em outro dispositivo autenticado e apontar para o aparelho de destino (recurso ainda não desenvolvido); o botão desta versão testa **o próprio aparelho que o aciona**, não comprova entrega com app fechado.

**Rollback:** definir `PWA_PUSH_PILOT_TEST_ENABLED=false` e redeploy; o botão some e a API nega os testes. As flags operacionais permanecem desativadas em qualquer cenário.
