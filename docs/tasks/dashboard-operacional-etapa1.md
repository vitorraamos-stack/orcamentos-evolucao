# Dashboard operacional — Etapa 1

**Base:** decisões 01 a 44 aprovadas. **Etapa 1:** 01–05, 07–09, 11–13, 23–26 e 29. A aprovação do planejamento não autoriza merge, migrations ou publicação.

## Entregue nesta branch

- Os quatro indicadores fixos (OS ativas, Exigem atenção, Atrasadas, Vencem hoje) representam **estado atual**, independente de filtros temporais; a referência de calendário é \`America/Sao_Paulo\` (SC).
- Lista de no máximo **cinco OS**, com número oficial da venda, cliente, serviço, etapa, responsável acessível, prazo e motivo da seleção. Classificação por prazo vencido, bloqueios registrados, vencimento hoje, prazo crítico (até 1 dia útil), urgência, próximo prazo (2–3 dias úteis) e ausência de atualização por 4+ dias, nessa ordem; desempates por prazo/atualização/ID. Apenas situações de atenção real entram nas até cinco OS prioritárias e no indicador “Exigem atenção”; prazos distantes e OS sem sinal de risco não recebem alertas. Dias úteis excluem sábado e domingo, usando a data operacional de São José/SC.
- Fluxo por **Arte e aprovação, Produção, Finalização e Logística**, usando campos existentes. Contagens por OS distinta em cada grupo; sobreposições reais permitidas entre setores, sem inventar operações ou interdependências ainda não consultadas.
- Leitura com RLS existente; consulta em páginas de 500, contagem exata e reconciliação limitada; somente as cinco prioridades têm responsáveis consultados. Sem escrita em banco. Navegação usa rotas com os guards atuais.
- Atualização manual e automática a cada 120 s quando visível, atualização no retorno se defasada, descarte de respostas anteriores/canceladas, persistência somente em memória da última consulta válida do mesmo usuário e carregamento progressivo.
- Zeros reais, erros, estados vazios e indisponibilidade explicitamente distintos; sem números demonstrativos.
- Previews da branch desativados no \`vercel.json\`; **a entrada da branch deve ser removida antes de eventual merge**, mediante autorização.

## Fora do escopo desta etapa (mantidas no planejamento)

- Etapa 2: agenda/compromissos/visão 60% prioridades e 40% agenda (06, 10, 14, 21, 22, 27–32).
- Etapa 3: preparação operacional (33, 34, 38–40, 42).
- Etapa 4: ajustes administrativos, limites e inteligência avançada, operações dependentes e gargalos (15–20, 35–37, 41, 43–44).

## Critérios de validação

Executar \`npm run check\`, \`npm run test\`, \`npm run build:app\`; conferir desktop/mobile/tema escuro, perfis com acesso a Arte/Produção/Logística, RLS, ausências de prazo/responsável, OS finalizadas/arquivadas, mudanças concorrentes, erro de rede e retorno de guia oculta. Revisar visualmente e homologar antes de autorização de merge/publicação.

**Limites:** nenhuma migration Supabase, nenhuma mudança de auth, nenhuma modificação de outros módulos, nenhuma promoção para \`main\` e nenhum deploy autorizado.
