# Arquitetura

## Objetivo

Transformar sinais dispersos sobre IA em um carrossel semanal do Instagram, com seleção orientada por engajamento, revisão automática independente e aprendizado contínuo com as métricas reais do perfil.

## Fluxo principal

```text
RSS + arXiv + Hacker News
        │
        ▼
Coleta e normalização diária
        │
        ▼
Deduplicação por URL e agrupamento por acontecimento
        │
        ▼
Ranking inicial + modelo aprendido do perfil
        │
        ▼
Roteiro e legenda por LLM
        │
        ├── revisão factual
        ├── revisão editorial/engajamento
        └── validações programáticas de marca e formato
        │
        ▼
Correção automática (uma tentativa)
        │
        ▼
Aprovação automática ou bloqueio
        │
        ▼
Renderização dinâmica 1080 × 1350
        │
        ▼
Instagram API com Instagram Login
        │
        ▼
Insights → atualização dos pesos do ranking
```

## Segurança

- Não existe cadastro público; os usuários entram somente por convite do Supabase Admin API.
- Todos os usuários autenticados são administradores, conforme o requisito atual.
- O token do Instagram é criptografado com AES-256-GCM antes de ser persistido.
- As imagens públicas usadas pela API do Instagram exigem assinatura HMAC por post e posição.
- `SUPABASE_SECRET_KEY`, `META_APP_SECRET`, `APP_ENCRYPTION_KEY` e `CRON_SECRET` nunca chegam ao navegador.
- RLS está habilitado em todas as tabelas e permite acesso somente ao papel `authenticated`; processos automáticos usam a chave secreta no servidor.

## Aprendizado

O score de uma publicação prioriza compartilhamentos, salvamentos e seguidores, normalizados por alcance. Depois de 48 horas, o sistema aplica uma atualização online nos pesos das características do conteúdo. O modelo começa com pesos editoriais e passa a refletir o comportamento do perfil.

O MVP usa um modelo linear simples e auditável. Com mais dados, ele pode ser substituído por regressão regularizada ou bandit contextual sem alterar o restante do pipeline.

## Disponibilidade e custo

- Frontend/API: Vercel Hobby ou Cloudflare compatível com Next.js.
- Banco/Auth: Supabase Free.
- Agendamento: GitHub Actions do repositório público.
- Texto: camada gratuita da Groq.
- Renderização: `ImageResponse` do próprio Next.js.
- Publicação e métricas: API oficial da Meta.

Os planos gratuitos têm limites. A aplicação registra falhas e nunca publica quando uma revisão ou integração não termina corretamente.
