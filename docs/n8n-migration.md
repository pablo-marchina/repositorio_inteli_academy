# O que foi preservado do coletor n8n

Os arquivos `Workflow *.json` continuam na raiz como referência histórica. A aplicação não executa n8n nem usa Google Sheets como banco.

## Workflow 1 — Coletor diário

### Comportamento antigo

```text
agenda diária
→ lê catálogo de RSS
→ consulta os feeds
→ normaliza artigos
→ classifica relevância
→ grava no Google Sheets
```

### Implementação atual

```text
GitHub Actions
→ endpoint de cron
→ fontes fixas + Hacker News + catálogo comunitário
→ todos os feeds válidos do catálogo
→ coleta concorrente com falhas isoladas
→ normalização e deduplicação
→ pré-filtro objetivo
→ seleção dos 60 candidatos mais fortes
→ classificação de relevância e categoria pelo Gemini
→ corte mínimo de relevância
→ Supabase
→ clusters e ranking
```

Não existe limite de 16 feeds descobertos. O número `16` agora é apenas a concorrência máxima de requisições simultâneas, não a quantidade de fontes analisadas.

O pré-filtro antes do Gemini considera:

- relação explícita com IA;
- recência;
- qualidade atribuída à fonte;
- clareza do título;
- pontos, comentários e menções disponíveis;
- penalização de itens promocionais ou operacionais, como vagas e inscrições em eventos.

Todos os feeds são consultados, mas somente os 60 candidatos com maior prioridade objetiva são enviados ao modelo por execução. Isso reduz tokens sem reduzir a cobertura de fontes.

O classificador retorna somente:

```text
relevanceScore
category
rationale
```

Sentimento e oportunidade de startup não fazem parte do produto.

## Workflow 2 — Sintetizador semanal

Não foi migrado. A aplicação é orientada à criação do post semanal, não à produção de um relatório paralelo. Os melhores artigos e clusters alimentam diretamente a geração do carrossel.

As fontes são mantidas nas evidências internas, na revisão factual e na legenda. Não existe obrigação de criar um slide de fontes no carrossel.

## Workflow 3 — Chatbot Slack

Não foi migrado. A seleção e auditoria acontecem na página **Artigos**, onde administradores podem pesquisar, ordenar, abrir fontes e escolher manualmente o material do post.

## Workflow de erro e Slack

Não foi migrado. Execuções e falhas são registradas em `pipeline_runs`, e a infraestrutura usa logs do GitHub Actions e da Vercel.

## Banco de dados

| n8n antigo | Aplicação atual |
|---|---|
| Google Sheets | Supabase |
| uma linha por artigo | tabela `articles` |
| pontuação de relevância | `articles.raw.insight.relevanceScore` |
| categoria | `articles.raw.insight.category` |
| resultado da filtragem | `articles.raw.filterDecision` |
| execução do workflow | tabela `pipeline_runs` |

Nenhuma migration adicional é necessária para essa camada: a classificação é armazenada no JSON `raw` já existente.

## Separação dos modelos

```text
gemini-3.5-flash-lite
→ classificação dos 60 candidatos mais fortes

gemini-3.6-flash
→ roteiro, legenda, composição visual, fact-checking,
  revisão editorial e correção
```

Essa separação evita usar o modelo editorial mais pesado em todos os artigos coletados e preserva a melhor capacidade disponível para o post final.
