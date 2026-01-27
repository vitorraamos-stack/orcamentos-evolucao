# Evolução Impressos - Sistema de Orçamentos

Sistema web para cálculo de orçamentos de comunicação visual, desenvolvido com React, Tailwind e Supabase.

## Funcionalidades

*   **Calculadora Inteligente**: Cálculo de área (cm -> m²) com aplicação automática de faixas de preço.
*   **Gestão de Materiais**: Cadastro de materiais com valor mínimo e múltiplas faixas de preço (Tiered Pricing).
*   **Autenticação**: Login seguro via, Supabase Auth.
*   **Exportação**: Botão para copiar resumo formatado para WhatsApp.

## Configuração Inicial

### 1. Supabase
1.  Crie um projeto no [Supabase](https://supabase.com).
2.  Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_schema.sql` incluído neste projeto.
3.  Vá em **Project Settings > API** e copie a `URL` e a `anon public key`.

### 2. Variáveis de Ambiente
Renomeie o arquivo `.env.example` para `.env` e preencha com suas chaves:

```env
VITE_SUPABASE_URL=sua_url_aqui
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

### 3. Instalação e Execução
```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build
```

## Deploy (Netlify)
Este projeto já está configurado para deploy no Netlify.
1.  Conecte seu repositório ao Netlify.
2.  Defina as variáveis de ambiente (`VITE_SUPABASE_URL`, etc) no painel do Netlify.
3.  O comando de build é `npm run build` e o diretório é `dist`.

## Estrutura do Projeto
*   `/src/pages`: Telas do sistema (Home, Login, Materiais).
*   `/src/components`: Componentes reutilizáveis (UI Shadcn).
*   `/src/lib`: Configuração do Supabase e utilitários.
*   `/src/contexts`: Contexto de Autenticação.up
