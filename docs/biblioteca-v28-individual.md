# Biblioteca V28 individual — Escopo de implantação

Esta etapa entrega a experiência de **produto individual**, preservando o catálogo atual e todas as fichas já cadastradas.

## Incluído
- Gestão de catálogo, nova ficha, edição, prévia em edição/publicada, publicação imutável, histórico e arquivo/restauração
- Upload de imagens JPG/PNG/WebP até 8 MB em bucket **privado** `library-product-images`; itens aprovados na publicação recebem acesso com URL assinada e RLS. Fotos internas permanecem privadas, sem acesso do consultor. Reordenação, capa, legenda, tipo de imagem e visibilidade
- Modelos prontos por categoria e modelos reutilizáveis persistidos em `library_config_templates`; aplicar adiciona somente campos ausentes e preserva o que já foi personalizado no produto. Modelo aplicado é uma cópia datada com origem e versão registrada no rascunho
- Campos customizados, tipos, opções, condições, ordenação e prévia
- Complementos reutilizáveis em `library_complement_catalog`, individuais, com separação comercial ou interna
- Regras: recomendação, exigência ou dispensa justificada de fotos; condições SE → ENTÃO para avisos, fotografias ou avaliação técnica; obrigatoriedade de superfície quando instalação, cor quando pintura; indicação de revisão técnica por fixação especial
- Configuração de **um produto por vez**, com rascunho provisório e cópia de descrição individual para inclusão manual no Conta Azul. **Sem preços automáticos**.

## Fora do escopo por decisão do gestor
- Projetos e carrinhos de múltiplos produtos
- Compartilhamento ou agrupamento de instalações entre produtos
- Preparação multiproduto
- Módulo de acompanhamento de pareceres técnicos.

## Segurança e implantação
- Migration `supabase/migrations/20261016213541_library_v28_individual.sql` já aplicada no Supabase de produção sob a versão `20261016213541`; não executar novamente. A correção do nome no repositório alinha o histórico de migrations.
- Testar perfis gerente e consultor, publicação sanitizada, assinatura da foto somente após publicação e acesso negado para perfis não autorizados.
- Testar idempotência da publicação, histórico e revisão concorrente.
- CI deve passar `npm run verify:prod` antes do merge.
- Reduzir deploys: uma branch consolidada, um PR, merge após a migration.
- Os campos de arquivo usados pelo consultor nesta etapa são controles locais, sem upload automático, e não devem ser tomados por comprovantes anexados.
- Não copiar orientações internas, custos ou regras privadas ao Conta Azul.

## Limitação técnica explícita
Os modelos cadastrados têm versão inicial e são aplicados como snapshots. Nesta primeira entrega, edição de uma definição existente não é exposta na interface; alterar um modelo significa criar outra definição. O versionamento de fichas do produto publicado é independente e preservado.
