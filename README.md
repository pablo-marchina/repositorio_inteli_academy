# Inteli Academy AI Weekly

Aplicação web multiusuário que pesquisa os assuntos de inteligência artificial com maior potencial de engajamento, cria um carrossel semanal dentro da identidade visual do Inteli Academy, revisa e aprova automaticamente, publica no Instagram e aprende com o desempenho real do perfil.

> O Figma original foi usado somente como referência de leitura. Nenhuma página ou camada do arquivo foi alterada.

## O que mudou em relação ao projeto inicial

O repositório começou como quatro workflows de n8n para coleta, síntese, Slack e alertas. Esses arquivos continuam na raiz como referência histórica. A aplicação principal agora é um produto Next.js com:

- autenticação por convite e acesso administrativo;
- painel compartilhado para várias pessoas;
- coleta gratuita por RSS, arXiv e Hacker News;
- agrupamento de matérias sobre o mesmo acontecimento;
- ranking pelo potencial de compartilhamentos, salvamentos e seguidores;
- geração de carrosséis sem template fixo;
- identidade Inteli Academy: azul `#2A00FF`, branco, preto, grandes títulos, cards e composições geométricas;
- revisão factual, editorial, visual e técnica;
- correção e aprovação automáticas;
- conexão, desconexão e troca da conta profissional do Instagram;
- agendamento editável pelo painel;
- renderização de 5 a 10 slides em `1080 × 1350`;
- publicação oficial de carrosséis pela Meta;
- coleta de insights e atualização contínua dos pesos de engajamento;
- automação horária pelo GitHub Actions, executando somente etapas vencidas;
- registro de todas as execuções e falhas.

## Stack gratuita do MVP

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16 + React 19 |
| Banco e autenticação | Supabase |
| Modelo de linguagem | Groq, modelo configurável |
| Renderização | Next.js `ImageResponse` |
| Publicação e métricas | Instagram API with Instagram Login |
| Agendamento | GitHub Actions |
| Hospedagem | Vercel Hobby ou equivalente |

## Pipeline

```text
coleta → deduplicação → clusters → ranking → geração
      → revisão factual/editorial/técnica → correção
      → aprovação automática → agendamento → publicação
      → insights → aprendizado dos pesos
```

Uma reprovação não é ignorada. O sistema tenta corrigir o post uma vez; se qualquer revisão continuar abaixo do limite, o status vira `failed` e nada é publicado.

## Execução local

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Consulte o guia completo em [`docs/SETUP.md`](docs/SETUP.md) e a arquitetura em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estrutura

```text
app/                       interface e rotas da API
components/                componentes do painel
lib/                       coleta, IA, ranking, Instagram e pipeline
supabase/migrations/       banco, RLS e dados iniciais
.github/workflows/         automação recorrente
docs/                      implantação e arquitetura
Workflow *.json            protótipo n8n preservado
```

## Segurança operacional

- cadastro público desativado;
- usuários somente por convite;
- tokens do Instagram criptografados com AES-256-GCM;
- imagens assinadas por HMAC;
- segredos restritos ao servidor;
- RLS em todas as tabelas;
- limite de três tentativas de publicação;
- nenhuma publicação quando não houver fontes, conta conectada ou aprovação integral.

## Comandos

```powershell
npm run dev
npm run typecheck
npm run lint
npm run build
npm run check
```
