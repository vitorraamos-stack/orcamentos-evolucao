# Push V4 — teste remoto com aparelho bloqueado (piloto)

## Pré-requisitos
- Inscrições Push V4 ativas e ao menos um aparelho cadastrado.
- Variáveis existentes `PWA_PUSH_REGISTRATION_ENABLED=true` e `PWA_PUSH_PILOT_TEST_ENABLED=true`, restritas pelo `PWA_PUSH_CANARY_USER_IDS`.
- As flags operacionais `generation_enabled=false` e `delivery_enabled=false` continuam inalteradas.

## Como testar
1. No aparelho que deve **receber** (iPhone/PWA instalado, notificações já ativas), abra Central de Notificações e clique em **Escolher este aparelho para teste com app fechado**. Confirme. Esta ação não envia push, apenas vincula seu endpoint cadastrado à sua própria conta.
2. Feche o aplicativo no aparelho de destino e bloqueie a tela.
3. No computador, entre no **mesmo usuário** do EvoluSystem e abra Central de Notificações. Clique **Enviar teste ao aparelho escolhido** e confirme.
4. O servidor valida autenticação e allowlist, recupera exclusivamente o endpoint previamente escolhido pela própria conta e utiliza o limite atômico já existente: 2 minutos de intervalo e no máximo 5 tentativas em 24 horas.
5. Confirme no celular se apareceu notificação mesmo com o app fechado e a tela bloqueada. A API confirma somente aceite pelo provedor, não o recebimento físico. Ao tocar, a notificação leva para a página inicial.

## Segurança
- Nenhum envio automático, cron, evento de OS, fila operacional, escolha arbitrária de URL, cliente, texto ou destinatário por query.
- Os dois RPCs novos são `SECURITY INVOKER`, sem EXECUTE para público/anon/authenticated, somente para service_role.
- A tabela `private.push_pilot_targets` tem RLS e não expõe a assinatura ao frontend.
- A seleção só funciona para dispositivo inscrito, ativo, da conta autenticada. Se for revogado, a tentativa falha.
- O contador de testes é compartilhado entre envio no próprio aparelho e envio remoto.
- Para interromper os testes: colocar `PWA_PUSH_PILOT_TEST_ENABLED=false` na Vercel Production e publicar novo deploy.
