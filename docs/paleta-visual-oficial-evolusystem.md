# EvoluSystem — Paleta visual oficial (Dark)

Referência: **Minha Fila de Trabalho**. Esta paleta é o padrão visual dos módulos do sistema, sem alterar seus layouts, fluxos ou permissões. O modo escuro permanece obrigatório.

| Função | Token CSS | Cor |
|---|---|---|
| Fundo geral | `--evolu-page` | `#0B1219` |
| Menu lateral | `--evolu-sidebar-bg` | `#111E29` |
| Cards e painéis | `--evolu-panel` | `#162631` |
| Superfícies elevadas / cabeçalhos | `--evolu-panel-raised` | `#1C2935` |
| Campos | `--evolu-field` | `#10212C` |
| Bordas | `--evolu-border` | `#2B4555` |
| Links, destaques e foco | `--evolu-highlight` | `#65D1E9` |
| Texto | `--evolu-text` | `#EDF4FA` |
| Texto secundário | `--evolu-text-muted` | `#9BB4C5` |
| Ações | `--evolu-action-bg` | `#254D62` |
| Ação em hover | `--evolu-action-hover` | `#346781` |
| Texto de ações | `--evolu-action-text` | `#C9EDF8` |
| Atraso / erro | `--evolu-danger` | `#FF8999` |
| Atenção / prazo | `--evolu-warning` | `#F7BB70` |
| Conclusão | `--evolu-success` | `#6CD8B6` |

## Implementação

- **Fonte única:** `src/index.css`, com tokens semânticos existentes (`--background`, `--card`, `--foreground`, `--primary`, `--sidebar`, etc.) derivados da paleta oficial. `:root` e `.dark` compartilham a identidade escura.
- **Componentes base:** shadcn / Tailwind consomem tokens semânticos; botões de ação utilizam a superfície azul discreta, e links/focos usam o ciano da referência.
- **Shell:** `src/components/evolusystem-shell.css` altera **somente cores**, preservando geometria, renderização da sidebar, links, menu móvel e layout da página.
- **Módulos de maior densidade:** Dashboard Operacional, Central de OS, detalhes da OS, Login e redefinição de senha têm seus tons próprios alinhados aos tokens centrais, mantendo a estrutura e ações.
- **Demais módulos:** quando usam componentes base (`bg-card`, `bg-background`, `text-primary`, bordas e campos shadcn), herdam a identidade automaticamente.

## Regras de segurança visual

1. Nunca recolorir fotos, arquivos de arte, layouts, provas de impressão, logos e etiquetas geradas; o usuário precisa visualizá-los nas cores reais. `@media print` continua usando fundo branco para etiquetas.
2. Preservar as cores semânticas de perigo, aviso e sucesso; não tratar todos os estados como azul.
3. Não alterar dimensões, posições, breakpoints ou conteúdo de páginas como parte da padronização de cores.
4. Para novos componentes, preferir tokens semânticos aos valores hexadecimais fixos. Componentes especializados com contraste adequado podem manter cores específicas para leitura e execução.
5. Revisar visualmente telas autenticadas em desktop e PWA; testes automáticos garantem tokens e contratos, mas não substituem inspeção da interface renderizada.

Nenhuma alteração de banco de dados, regras operacionais, push ou permissões faz parte desta migração.
