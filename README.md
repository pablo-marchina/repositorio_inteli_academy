# Inteli AI Intelligence Hub

> Sistema de automação inteligente para monitoramento, análise e distribuição de notícias sobre Inteligência Artificial — desenvolvido com n8n, Llama 3.3 70b e integração com Google Sheets, Gmail e Slack.

---

## Visão Geral

Este projeto ultrapassa o escopo mínimo solicitado. Em lugar de uma automação linear de coleta e envio de notícias, foi concebido e implementado um **ecossistema de quatro workflows interligados**, que opera como uma redação automatizada de Inteligência Artificial — coletando, analisando, sintetizando e distribuindo conteúdo de forma completamente autônoma.

---

## Arquitetura do Sistema

```
Workflow 1 (diário)       Workflow 2 (semanal)      Workflow 3 (on-demand)
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Coletor Diário  │ ───▶ │  Sintetizador    │      │  Chatbot Slack   │
│  Coleta, analisa │      │  Semanal         │      │  Responde        │
│  e armazena      │      │  Gera relatório  │      │  perguntas       │
│  artigos de IA   │      │  e distribui     │      │  em tempo real   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
         │                        │                          │
         └────────────────────────┴──────────────────────────┘
                                  │
                     ┌────────────────────────┐
                     │     Google Sheets      │
                     │  (banco de dados       │
                     │   compartilhado)       │
                     └────────────────────────┘
                                  │
                     ┌────────────────────────┐
                     │   Workflow de Erro     │
                     │  Monitoramento de      │
                     │  falhas em tempo real  │
                     └────────────────────────┘
```

---

## Estrutura do Repositório

```
/
├── workflow-1-coletor-diario.json
├── workflow-2-sintetizador-semanal.json
├── workflow-3-chatbot-slack.json
├── workflow-de-erro.json
└── README.md
```

---

## Workflow 1 Coletor Diário

**Agendamento:** Diariamente às 8h

**Descrição:**

Este workflow constitui a base de dados do ecossistema. Sua principal inovação em relação à abordagem convencional reside na utilização de **fontes dinâmicas**: em vez de feeds RSS fixos, o sistema consulta o repositório público [allainews_sources](https://github.com/foorilla/allainews_sources), que reúne centenas de fontes curadas de notícias sobre IA. Isso garante que, à medida que novas fontes são incorporadas ao repositório, o workflow as inclua automaticamente sem qualquer intervenção manual.

**Etapas de execução:**
1. Recuperação dinâmica das URLs de feeds RSS via requisição HTTP ao repositório público
2. Requisição HTTP individual a cada feed, com tratamento de falhas e reenvio automático
3. Parsing do XML bruto e normalização de todos os artigos em estrutura padronizada
4. Deduplicação por URL e similaridade de título
5. Pré-pontuação local por palavras-chave relevantes ao ecossistema de IA
6. Seleção dos dez artigos de maior relevância para análise
7. Análise individual por Llama 3.3 70b, retornando para cada artigo:
   - **Resumo** objetivo (até 100 caracteres)
   - **Pontuação de relevância** (escala de 1 a 10)
   - **Sentimento** (positivo, neutro ou negativo)
   - **Categoria** (LLMs, Computer Vision, Robótica, Ética em IA, entre outras)
   - **Oportunidade de startup** identificada a partir da notícia
8. Persistência dos dados no Google Sheets como banco de dados acumulativo
9. Envio de resumo diário ao Slack com Top 5 artigos e estatísticas

---

## Workflow 2 Sintetizador Semanal

**Agendamento:** Todos os domingos às 9h

**Descrição:**

Ao final de cada semana, este workflow consolida os artigos coletados pelo Workflow 1, produz uma análise executiva aprofundada e a distribui simultaneamente em quatro canais distintos.

**Etapas de execução:**
1. Leitura de todos os artigos armazenados no Google Sheets
2. Filtragem dos registros dos últimos sete dias e cálculo de estatísticas agregadas
3. Geração de análise executiva completa pelo Llama 3.3 70b:
   - **Resumo executivo** do estado do ecossistema de IA na semana
   - **Três principais tendências** identificadas, com análise aprofundada de cada uma
   - **Radar de startups** com três oportunidades de negócio concretas, incluindo justificativa de timing
   - **Previsões para a semana seguinte**, fundamentadas nos padrões identificados nos dados
4. Distribuição simultânea em quatro canais:
   -  **E-mail HTML estilizado** via Gmail, com layout editorial gerado dinamicamente
   -  **Mensagem estruturada** no Slack com resumo executivo e destaques
   -  **Arquivo HTML** salvo localmente, abrível em qualquer navegador
   -  **Registro histórico** na aba "Resumos Semanais" do Google Sheets

**Diferencial:** a inclusão de análise preditiva, previsão do que provavelmente será notícia na semana seguinte — é uma funcionalidade ausente em todos os templates e projetos similares analisados durante o desenvolvimento.

---

## Workflow 3 Chatbot Slack On-Demand

**Modo de operação:** Sempre ativo via webhook permanente (`/webhook/chatbot-ia`)

**Descrição:**

Este workflow transforma a newsletter passiva em uma ferramenta interativa. Qualquer membro do workspace pode consultar a base de dados em linguagem natural diretamente pelo Slack, recebendo respostas fundamentadas nos artigos reais coletados pelo Workflow 1.

**Etapas de execução:**
1. Recebimento da requisição via Slash Command `/ia [pergunta]`
2. Resposta imediata ao Slack com mensagem de espera (requisito de tempo do Slack: menos de 3 segundos)
3. Extração e normalização da pergunta, canal e identificador do usuário
4. Leitura dos artigos do Google Sheets
5. Filtragem dos artigos dos últimos sete dias com pontuação de relevância igual ou superior a 6
6. Geração de resposta contextualizada pelo Llama 3.3 70b, baseada exclusivamente nos artigos disponíveis
7. Envio da resposta formatada ao canal de origem no Slack

**Exemplos de uso:**
```
/ia o que aconteceu em ética em IA essa semana?
/ia quais são as últimas novidades sobre LLMs?
/ia existe alguma oportunidade de startup em computer vision?
```

---

## Workflow de Erro Monitoramento

**Modo de operação:** Sempre ativo, acionado automaticamente pelo n8n em caso de falha

**Descrição:**

Configurado como Error Workflow nos três workflows principais, este componente é acionado automaticamente pelo n8n sempre que qualquer nó falha em qualquer parte do ecossistema. Ao ser disparado, envia imediatamente um alerta ao Slack contendo o nome do nó com falha, a mensagem de erro e o timestamp do ocorrido.

A implementação de um sistema de monitoramento de erros é uma prática de engenharia frequentemente negligenciada em projetos desta natureza, e sua presença demonstra atenção à robustez e à manutenibilidade do sistema.

---

##  Configuração e Instalação

### Pré-requisitos

- [n8n](https://n8n.io/) rodando via Docker
- Conta Groq com acesso ao modelo Llama 3.3 70b (ou OpenAI)
- Google Sheets com as abas `Artigos` e `Resumos Semanais` configuradas
- Slack App com Slash Command `/ia` configurado
- [ngrok](https://ngrok.com/) para exposição do webhook (Workflow 3)

### Estrutura do Google Sheets

**Aba `Artigos`** — alimentada pelo Workflow 1:
```
titulo | url | fonte | resumo | pontuacao_relevancia | sentimento | categoria | oportunidade_startup | data_publicacao | autor | data_coleta
```

**Aba `Resumos Semanais`** — alimentada pelo Workflow 2:
```
semana | total_artigos | positivos | neutros | negativos | resumo_executivo | principais_tendencias | radar_startups | previsoes_proxima_semana | categorias_distribuicao | data_geracao
```

### Importação dos Workflows

1. Acesse o n8n em `http://localhost:5678`
2. Clique em **+** para criar um novo workflow
3. Acesse o menu `...` → **Import from file**
4. Selecione o arquivo `.json` correspondente
5. Configure as credenciais em cada nó (Google Sheets, Slack, Groq/OpenAI, Gmail)
6. Substitua o ID da planilha nos nós do Google Sheets
7. Ative cada workflow por meio do botão **Active** no canto superior direito

### Ordem de ativação recomendada

1. `workflow-de-erro.json`
2. `workflow-1-coletor-diario.json`
3. `workflow-2-sintetizador-semanal.json`
4. `workflow-3-chatbot-slack.json`

### Configuração do ngrok (necessário para o Workflow 3)

```powershell
# Instalação via winget
winget install ngrok.ngrok

# Autenticação
ngrok config add-authtoken SEU_TOKEN

# Inicialização do túnel
ngrok http 5678
```

Insira a URL gerada no painel do Slack App:
**api.slack.com/apps** → seu aplicativo → **Slash Commands** → `/ia` → campo **Request URL**:
```
https://xxxx.ngrok-free.app/webhook/chatbot-ia
```

---
---

*Desenvolvido como projeto de processo seletivo para o Inteli Academy — abril de 2026.*
