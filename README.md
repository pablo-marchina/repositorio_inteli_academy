<p align="center">
  <img src="public/ia-mark.svg" alt="Inteli Academy" width="88" />
</p>

<h1 align="center">Inteli Academy Content Studio</h1>

<p align="center">
  Plataforma interna para pesquisar pautas, gerar conteúdo social com IA, preservar a identidade visual real da Inteli Academy, revisar em Figma, trabalhar Reels de forma estruturada e publicar no Instagram.
</p>

<p align="center">
  <a href="https://github.com/pablo-marchina/repositorio_inteli_academy/actions/workflows/ci.yml"><img src="https://github.com/pablo-marchina/repositorio_inteli_academy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  &nbsp;
  <a href="https://repositorio-inteli-academy-pablo-marchinas-projects.vercel.app">Produção</a>
</p>

> **Princípio central:** qualidade visual, fidelidade à identidade da Inteli Academy e editabilidade são requisitos simultâneos. O artefato canônico não é uma imagem achatada: o sistema mantém conteúdo e design estruturados para permitir revisão humana real no Figma e edição temporal de vídeo.

## Visão geral

O projeto reúne dois fluxos complementares:

1. **Content Studio** — fluxo principal para criar `Post`, `Carrossel`, `Reel` e `Story` a partir de contexto, artigos opcionais, referências reais do Instagram e mídias explicitamente selecionadas no Google Drive.
2. **AI Weekly** — pipeline editorial automatizado legado que coleta notícias de IA, classifica pautas, gera carrosséis, revisa, agenda, publica e aprende com métricas reais do perfil.

O Content Studio é o caminho de maior controle editorial. Cada geração cria uma versão preservada (`V1`, `V2`, `V3`...), alterações podem ser pedidas em linguagem natural, apenas a versão escolhida é enviada ao Figma e a publicação exige aprovação explícita.

## Principais capacidades

- criação de **post único, carrossel, Reel e Story**;
- seleção opcional de artigos como evidência factual;
- contexto livre com objetivo, público, CTA e restrições;
- múltiplos posts reais do Instagram como referência editorial/visual;
- sincronização do histórico real do perfil conectado;
- Google Drive em modo **somente leitura**, com seleção explícita dos assets permitidos por projeto;
- geração estruturada por Gemini com validação por Zod;
- **Scene Graph / Design AST** com papéis semânticos e bindings de mídia;
- herança de frames reais do Figma em vez de reconstrução visual genérica;
- preservação de alterações humanas em revisões subsequentes;
- brand linter estrutural + revisão visual;
- preview temporal de Reels com Remotion;
- revisões de motion em linguagem natural;
- export de timeline em **OTIO** e manifest estruturado para editores;
- export nativo para **After Effects** por pacote com script `.jsx`, layers de texto, gráficos e mídia separados;
- publicação via Instagram API with Instagram Login;
- coleta de Insights e pipeline semanal orientado por engajamento;
- autenticação via Supabase com acesso institucional Inteli e convites administrativos;
- CI com `typecheck`, `lint` e `build`.

## Fluxo do Content Studio

```text
Brief / contexto
      │
      ├── artigos opcionais
      ├── referências reais do Instagram
      └── mídias selecionadas do Drive
      │
      ▼
Gemini + regras factuais + identidade auditada
      │
      ▼
Scene Graph estruturado + Brand Audit
      │
      ▼
V1 ── revisão em linguagem natural ──► V2 ──► V3 ...
      │
      ▼
Selecionar uma versão
      │
      ▼
Figma Content Bridge
      │
      ├── clona frame real compatível
      ├── altera papéis semânticos
      └── mantém elementos não solicitados editáveis
      │
      ▼
Revisão humana no Figma
      │
      ├── Post / Carrossel / Story → render do estado atual do Figma
      └── Reel → Remotion + OTIO / manifest / After Effects
      │
      ▼
Aprovação explícita
      │
      ▼
Instagram
```

## Fonte de verdade visual

A precedência de design é deliberada:

1. posts reais do Instagram escolhidos para aquele projeto;
2. histórico sincronizado do perfil;
3. página **Social Media** do arquivo Figma ID Academy como principal fonte visual executável para formatos sociais;
4. outras páginas auditadas do Figma como contexto de identidade;
5. artigos, briefing e mídia do Drive para restrições factuais e de conteúdo.

O plugin do Figma usa **editable frame inheritance**: clona frames existentes, preserva vetores, máscaras, efeitos, imagens e grupos e modifica somente os papéis semânticos necessários. Os bindings `AI::headline`, `AI::body`, `AI::media`, `AI::logo` e equivalentes permitem round-trip entre edição humana e novas versões geradas.

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16 + React 19 + TypeScript |
| Banco e autenticação | Supabase |
| IA | Google Gemini |
| Validação estruturada | Zod |
| Design editável | Figma REST API + plugin local Content Bridge |
| Motion | Remotion |
| Intercâmbio de edição | OpenTimelineIO + Academy editor manifest |
| Editor nativo | Adobe After Effects via `.jsx` bootstrap |
| Biblioteca de mídia | Google Drive OAuth, somente leitura |
| Publicação e métricas | Instagram API with Instagram Login |
| Agendamento | GitHub Actions |
| Hospedagem | Vercel |

## Requisitos

- **Node.js 22+**;
- npm;
- projeto Supabase;
- chave Gemini para geração/classificação;
- credenciais Instagram para conexão/publicação;
- credenciais Google OAuth se o Drive for usado;
- Personal Access Token do Figma se o fluxo Figma for usado;
- Figma Desktop para instalar o plugin local.

## Quick start local

```powershell
# 1. Clone e entre no projeto
git clone https://github.com/pablo-marchina/repositorio_inteli_academy.git
Set-Location repositorio_inteli_academy

# 2. Crie o arquivo de ambiente
Copy-Item .env.example .env.local

# 3. Instale dependências
npm install

# 4. Rode a aplicação
npm run dev
```

Abra `http://localhost:3000`.

Antes do primeiro uso, execute as migrations de `supabase/migrations/` no projeto Supabase e preencha as variáveis obrigatórias do ambiente.

## Variáveis de ambiente

Use `.env.example` como referência canônica. Nunca faça commit de valores reais de tokens, chaves ou client secrets.

### Base obrigatória

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública canônica; também define callbacks OAuth |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública do Supabase |
| `SUPABASE_SECRET_KEY` | operações administrativas server-side |
| `APP_ENCRYPTION_KEY` | criptografia de credenciais persistidas |
| `CRON_SECRET` | autenticação da automação e fallback de assinatura do pareamento Figma |

### IA

| Variável | Uso |
|---|---|
| `GEMINI_API_KEY` | geração, revisão e classificação |
| `GEMINI_POST_MODEL` | modelo editorial; possui valor padrão |
| `GEMINI_FILTER_MODEL` | modelo de classificação em volume; possui valor padrão |
| `GEMINI_FALLBACK_MODELS` | fallback de modelos |

### Instagram

| Variável | Uso |
|---|---|
| `INSTAGRAM_APP_ID` | **Instagram App ID** do produto Instagram |
| `INSTAGRAM_APP_SECRET` | **Instagram App Secret** correspondente |
| `INSTAGRAM_BUSINESS_LOGIN_URL` | opcional; URL de Business Login fornecida pela Meta |
| `META_GRAPH_VERSION` | versão da Graph API |

Os aliases `META_APP_ID` e `META_APP_SECRET` existem apenas para compatibilidade com deployments antigos. Configurações novas devem usar `INSTAGRAM_APP_*`.

Scopes solicitados pelo app:

```text
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_insights
```

Callback OAuth:

```text
<NEXT_PUBLIC_APP_URL>/api/instagram/callback
```

**Importante:** cadastre na Meta exatamente o callback exibido em **Configurações → Instagram**. O domínio, protocolo, path e barra final precisam coincidir com o `redirect_uri` enviado pelo app.

### Google Drive

| Variável | Uso |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Web Client |
| `GOOGLE_CLIENT_SECRET` | OAuth Web Client secret |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | raiz da biblioteca permitida |

Callback OAuth:

```text
<NEXT_PUBLIC_APP_URL>/api/drive/callback
```

O acesso solicitado é somente leitura. O Content Studio lista imagens/vídeos dentro da pasta configurada e não altera os arquivos originais.

### Figma

| Variável | Uso |
|---|---|
| `FIGMA_ACCESS_TOKEN` | leitura/exportação server-side do arquivo |
| `FIGMA_FILE_KEY` | arquivo ID Academy |
| `FIGMA_OUTPUT_PAGE_NAME` | página que recebe as gerações |
| `FIGMA_PLUGIN_SECRET` | opcional; segredo dedicado para assinatura do bridge |

O `FIGMA_ACCESS_TOKEN` **nunca vai para o plugin**. O plugin usa um código temporário mostrado em **Configurações → Figma**, troca esse código por uma credencial de bridge e guarda a credencial localmente no Figma.

Para instalar:

```text
Figma Desktop
→ Plugins
→ Development
→ Import plugin from manifest
→ figma-plugin/manifest.json
```

Depois abra **Inteli Academy Content Bridge**, use a URL exibida nas Configurações e cole o código de pareamento atual.

## Configuração do Instagram

O fluxo esperado é **Instagram API with Instagram Login / Business Login for Instagram**.

1. Crie/configure o produto Instagram no Meta App Dashboard.
2. Use o **Instagram App ID** e o **Instagram App Secret** mostrados na configuração do produto.
3. Habilite os scopes usados pelo projeto.
4. Cadastre exatamente o callback mostrado pelo Content Studio.
5. Para app ainda em desenvolvimento, adicione a conta profissional como **Instagram Tester** e aceite o convite na própria conta.
6. Configure `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` na Vercel e faça novo deploy.
7. Abra **Configurações → Conectar Instagram**.

Erros comuns:

| Erro | Verificação principal |
|---|---|
| `Invalid redirect_uri` | callback cadastrado na Meta diferente do exibido pelo Content Studio |
| `Insufficient developer role` / `Função de desenvolvedor é insuficiente` | conta ainda não é Instagram Tester ativo ou convite não foi aceito |
| credenciais não configuradas | `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` ausentes no deployment atual |

## Segurança

- segredos permanecem server-side;
- tokens OAuth persistidos são criptografados com `APP_ENCRYPTION_KEY`;
- tabelas usam RLS;
- publicação manual do Content Studio exige aprovação explícita;
- sem artigos selecionados, o Studio bloqueia alegações factuais externas sem fonte;
- com artigos, as fontes de `factualClaims` precisam pertencer ao conjunto selecionado;
- mídia do Drive só entra em uma geração quando foi explicitamente selecionada;
- o Figma é relido no momento da aprovação para evitar publicar um render anterior às edições humanas;
- endpoints públicos de mídia usam assinatura/validação antes de expor arquivos necessários à publicação;
- CI valida TypeScript, ESLint e build de produção.

## Estrutura do repositório

```text
app/                    Next.js App Router, páginas e API routes
components/             UI e workbenches do Content Studio
lib/                    domínio, IA, integrações, render, Scene Graph e exports
remotion/               composição temporal de vídeo
figma-plugin/            Content Bridge local do Figma
supabase/migrations/    schema e migrations do banco
docs/                   documentação técnica aprofundada
.github/workflows/      CI e automação externa
public/                 assets públicos do app
```

## Qualidade e CI

Execute antes de enviar uma alteração:

```powershell
npm run typecheck
npm run lint
npm run build
```

Ou execute tudo:

```powershell
npm run check
```

O workflow de CI executa a mesma sequência em Node 22 para pushes relevantes e pull requests.

## Workflow de desenvolvimento

Para mudanças não triviais:

1. atualize `main`;
2. crie uma branch curta e descritiva;
3. implemente a mudança;
4. rode `npm run check`;
5. abra um Pull Request com contexto, comportamento esperado, riscos e evidências de teste;
6. faça merge apenas com CI verde.

Nunca inclua `.env.local`, tokens, App Secrets, PATs ou credenciais OAuth em commits, issues ou screenshots públicas.

## Documentação técnica

- [`docs/structured-content-studio.md`](docs/structured-content-studio.md) — Scene Graph, Figma round-trip, Remotion e editor exports.
- [`docs/content-studio.md`](docs/content-studio.md) — jornada e modelo de dados do Studio.
- [`docs/figma-visual-inventory.md`](docs/figma-visual-inventory.md) — inventário da identidade extraída do Figma.
- [`docs/instagram-style-fidelity.md`](docs/instagram-style-fidelity.md) — estratégia de fidelidade às referências reais do Instagram.
- [`docs/n8n-migration.md`](docs/n8n-migration.md) — origem e migração dos workflows históricos.

## Pipeline semanal legado

O pipeline AI Weekly continua disponível separadamente do Content Studio:

```text
fontes RSS/Atom + Hacker News
→ coleta e normalização
→ deduplicação
→ pré-filtro objetivo
→ classificação por IA
→ agrupamento por acontecimento
→ ranking editorial/engajamento
→ geração do carrossel
→ revisões e validações
→ agendamento/publicação
→ Insights
→ atualização dos pesos
```

Os JSONs de workflows históricos permanecem no repositório como referência da automação anterior e da migração.

## Status do projeto

Projeto em evolução ativa. Integrações externas — especialmente Meta, Google OAuth, Figma e modelos Gemini — podem alterar requisitos, scopes ou limites. A aplicação mantém diagnósticos em **Configurações** para expor o callback efetivo e o estado de cada integração sem revelar segredos.
