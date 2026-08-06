# Inteli Academy AI Weekly

Aplicação web multiusuário que coleta notícias de inteligência artificial, filtra os artigos mais relevantes, cria um carrossel semanal fiel à identidade do Inteli Academy, revisa automaticamente, publica no Instagram e aprende com o desempenho real do perfil.

> O Figma original foi usado somente como referência de leitura. Nenhuma página ou camada do arquivo foi alterada.

## Produto atual

- autenticação por convite e definição de senha;
- painel compartilhado para administradores;
- coleta por fontes configuradas, Hacker News e catálogo comunitário de RSS/Atom;
- consulta a todos os feeds válidos encontrados no catálogo, sem limite arbitrário de 16;
- normalização de URLs, deduplicação e agrupamento de matérias sobre o mesmo acontecimento;
- pré-filtro objetivo por recência, relação com IA, qualidade da fonte e popularidade;
- classificação por relevância e categoria usando Gemini em alto volume;
- ranking pelo potencial de compartilhamentos, salvamentos e seguidores;
- seleção automática ou manual dos artigos;
- links diretos para todas as fontes originais;
- geração de carrosséis de 6 a 9 slides;
- revisão factual, editorial, visual e técnica;
- correção e aprovação automáticas;
- visualização completa dos slides pela interface;
- conexão e troca da conta profissional do Instagram;
- agendamento e publicação oficial pela Meta;
- coleta de insights e atualização contínua dos pesos de engajamento;
- registro de todas as execuções e falhas.

## Modelos Gemini

A aplicação separa tarefas de volume e tarefas editoriais:

| Função | Variável | Padrão |
|---|---|---|
| Classificação dos artigos | `GEMINI_FILTER_MODEL` | `gemini-3.5-flash-lite` |
| Geração, correção e revisões | `GEMINI_POST_MODEL` | `gemini-3.6-flash` |

O modelo de filtragem recebe apenas título, resumo, fonte, URL e data. Ele retorna nota de relevância, categoria e justificativa curta. Não gera sentimento, oportunidades de startup, relatórios ou respostas gerais sobre a base.

Para controlar o consumo de tokens, somente os 60 candidatos mais fortes após o pré-filtro são enviados ao Gemini por execução. Todos os feeds continuam sendo consultados; o limite se aplica apenas à classificação por IA.

## Identidade visual dos posts

O sistema visual dos carrosséis toma como referências:

- azul elétrico `#2A00FF`, branco, carvão `#272727` e cinza muito claro;
- grandes títulos e numerais editoriais;
- combinação de tipografia grotesca com serif editorial;
- grids assimétricos, espaço negativo e blocos sólidos;
- monograma `IA`;
- cards arredondados, linhas finas e motivos geométricos;
- composições de capa, pôster, módulos, divisão, pilha e lista;
- brackets, órbitas, grids técnicos, faixas e molduras.

Esses elementos orientam a direção de arte sem funcionar como uma lista de recursos obrigatórios ou proibidos. A validação técnica exige apenas capa inicial, CTA final, posições consistentes e limites de densidade de texto.

As fontes permanecem em `factualClaims`, na revisão factual e na legenda. O carrossel não precisa ter um slide exclusivo de fontes.

## Pipeline

```text
catálogo completo de feeds + fontes fixas + Hacker News
→ coleta concorrente com tolerância a falhas
→ normalização e deduplicação
→ pré-filtro objetivo
→ seleção dos 60 candidatos mais fortes
→ classificação de relevância em lotes
→ corte por nota mínima
→ agrupamento por acontecimento
→ ranking quantitativo + relevância editorial
→ seleção automática ou manual
→ geração do carrossel
→ revisão factual, editorial, visual e técnica
→ correção automática
→ aprovação e agendamento
→ publicação
→ métricas
→ aprendizado dos pesos
```

Uma reprovação não é ignorada. O sistema tenta corrigir o post uma vez; se qualquer revisão continuar abaixo do limite, o status vira `failed` e nada é publicado.

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16 + React 19 |
| Banco e autenticação | Supabase |
| Modelos | Google Gemini |
| Renderização | Next.js `ImageResponse` |
| Publicação e métricas | Instagram API with Instagram Login |
| Agendamento | GitHub Actions |
| Hospedagem | Vercel |

## Execução local

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Consulte [`docs/SETUP.md`](docs/SETUP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/n8n-migration.md`](docs/n8n-migration.md).

## Segurança operacional

- cadastro público desativado;
- usuários somente por convite;
- tokens do Instagram criptografados com AES-256-GCM;
- imagens assinadas por HMAC;
- segredos restritos ao servidor;
- RLS nas tabelas;
- validação e timeout para feeds externos;
- bloqueio básico de endereços locais e privados;
- limite de três tentativas de publicação;
- nenhuma publicação sem evidências, conta conectada ou aprovação integral.

## Comandos

```powershell
npm run dev
npm run typecheck
npm run lint
npm run build
npm run check
```
