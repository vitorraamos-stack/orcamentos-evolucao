# ADR-003 — Unidades e dimensões

**Status:** aceito — contratos 1.0.0

## Decisão

`linear_m` significa **Metro linear (ml)**. `ml` é símbolo de apresentação e **não é um
`UnitId`**; não há dimensão de volume no MVP.

Dimensões físicas são vetores de expoentes, permitindo futuramente inferir `m * m = m2` e
`m / m = scalar`. A semântica operacional é registrada separadamente. Assim, `linear_m`
compartilha dimensão física de comprimento com `m`, mas não é convertido implicitamente.
De modo similar, `un` e `sheet` são contagens com semânticas distintas e não intercambiáveis.

As únicas conversões globais iniciais são relações exatas: 1000 mm = 1 m, 100 cm = 1 m,
1000 g = 1 kg e 60 min = 1 h. Elas são armazenadas como razões de decimal strings.
Conversões contextuais — como `sheet → m2`, `un → sheet` ou `m → linear_m` — exigirão
intenção e dados de domínio em contratos futuros e nunca ocorrerão silenciosamente.
