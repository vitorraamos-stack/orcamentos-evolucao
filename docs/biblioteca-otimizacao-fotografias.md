# Biblioteca de Produtos — Otimização automática de fotografias

## Por que
O plano Free do Supabase tem armazenamento limitado e o primeiro arquivo do catálogo ocupava aproximadamente 7,75 MB. Esta melhoria mantém o bucket privado e otimiza as **novas fotografias da Biblioteca** antes de consumirem armazenamento e tráfego.

## Upload automático
- Seleção na aba **Gestão da Biblioteca → Produto → Galeria**.
- Aceita JPG, PNG e WebP até **30 MB de arquivo original**. Esse limite é do arquivo escolhido pelo operador, não do Supabase.
- O navegador decodifica a fotografia (respeitando a orientação EXIF quando suportada), limita a dimensão maior a até **1.800 px** e tenta gravar em **WebP** nas qualidades 83%, 73%, 73% (1.600 px) e 69% (1.400 px), interrompendo assim que o resultado fica em até cerca de **500 KB**.
- A meta de 500 KB **não é uma garantia fixa**: preferimos preservar a legibilidade e os detalhes. Se o navegador não suporta WebP, a extensão do objeto segue o MIME real do blob retornado.
- Fotografias pequenas já eficientes podem manter o original, sem aumentar a transferência.
- Nunca armazenamos ou enviamos o arquivo original quando uma otimização é aplicada. Somente o blob final é enviado.
- O bucket privado `library-product-images` continua com teto de **8 MB por objeto**. Se a compressão não chegar abaixo desse teto, o upload falha explicitamente.
- Ao concluir, o operador vê o tamanho original, tamanho gravado e redução percentual, e precisa **salvar o rascunho** para associar a imagem à ficha. Não há publicação automática.
- Galeria e aplicação comercial continuam usando o mesmo caminho `storage://library-product-images/<id_produto>/<uuid>.webp` (ou PNG/JPEG quando for o MIME efetivo).
- Sem migrations, sem mudanças em tabelas, RLS, regras comerciais ou tipos de produto.
- Imagens antigas **não serão alteradas**. Documentos de impressão/arquivos vetoriais e OSs não são processados por este módulo.

## Miniaturas e tráfego
As imagens usadas na galeria são agora pequenas por padrão (objetivo 200–500 KB), e continuam carregadas de forma preguiçosa. Nesta etapa **não criamos uma segunda cópia de miniatura**, que exigiria esquema e política RLS adicionais. É uma medida conservadora: evita duplicação de dados armazenados. Miniaturas dedicadas podem ser uma próxima melhoria se o catálogo crescer.

## Segurança, testes e limitações
- Compactação é exclusivamente client-side. Não há dependências de bibliotecas externas ou API de compressão de terceiros.
- O limite por arquivo é uma proteção de UX; o servidor continua aplicando as permissões do Storage e o teto de 8 MB.
- Browsers sem API nativa `createImageBitmap` informam que precisam de atualização; upload não prossegue silenciosamente com original grande.
- Podem ocorrer falhas com fotos corrompidas ou ambientes com memória insuficiente, apresentadas ao usuário.
- Resultado visual e redução variam conforme conteúdo da foto e navegador.
- Testes cobrem formatos, dimensão e proporção, MIME efetivo, compressão WebP, limite de entrada, cenário de arquivo já pequeno e falha fechada.
- Teste também um arquivo real de câmera na interface autenticada antes do rollout para toda a equipe.

## Entrega
Branch isolada + PR + CI `npm run verify:prod` antes do merge. Sem deploy manual; aguardar autorização de publicação.
