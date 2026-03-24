# Materiais em produção

## Escrita transacional
A escrita de material + faixas usa `public.upsert_material_with_tiers(...)` (RPC).

Fluxo:
1. Frontend valida payload (nome/faixas/valores).
2. Upload de imagem vai para bucket `materials`.
3. RPC grava material e recria tiers na mesma transação.
4. Qualquer erro aborta tudo.

## Leitura
Tela usa `select('*, price_tiers(*)')` para evitar N+1.

## Regras de imagem
- Proibido persistir `data:` URL em `materials.image_url`.
- Formatos aceitos: JPG/PNG/WEBP.
- Limite de upload: 2MB.
