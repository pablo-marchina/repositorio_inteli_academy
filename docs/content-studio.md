# Content Studio — Instagram → Figma → Instagram

## Objetivo

O Content Studio transforma contexto, referências reais do Instagram e, opcionalmente, artigos selecionados em conteúdo da Inteli Academy sem tratar a IA como uma fonte factual ou como um gerador visual sem contexto.

A ordem de autoridade é:

1. conjunto de posts reais do `@inteli.academy` escolhidos pelo usuário, quando houver — todos no mesmo nível, sem um principal automático;
2. histórico real sincronizado do `@inteli.academy`;
3. identidade completa do Figma ID Academy, com `Social Media` como principal fonte visual do Figma para formatos sociais;
4. artigos selecionados, quando houver, como evidência factual + contexto específico fornecido pelo usuário;
5. mídias do Drive explicitamente autorizadas para aquela geração.

Artigos, Drive, contexto e referências específicas do Instagram são opcionais. Quando nenhum artigo é selecionado, a geração não pode criar `factualClaims` nem introduzir fatos externos, números, datas, estudos, citações ou URLs sem fonte.

## Figma auditado

Auditoria completa em 12/08/2026 do arquivo `xFV6r1G9gMjWvLf7gqyuYo`:

| Página | Nodes | Papel principal |
|---|---:|---|
| Apresentações | 1.439 | linguagem de apresentação e marca |
| Calendário | 387 | informação/calendário |
| teste | 128 | experimentos/apresentações |
| Creative Deposit | 86 | ativos de identidade |
| Social Media | 2.989 | principal referência visual social do Figma |
| EXPORTAR | 141 | outputs/peças verticais |
| Totens | 284 | layouts verticais/eventos |
| Produtos | 232 | mockups, stickers, grafismos |
| stock photos | 69 | fotos, robôs e assets ilustrativos |

O inventário também está codificado em `lib/figma-audit.ts`.

## Jornada do usuário

1. Abrir **Criar conteúdo**.
2. Escolher `Post único`, `Carrossel`, `Reel` ou `Story`.
3. Opcionalmente selecionar até 12 artigos para fundamentar uma pauta ou fatos específicos.
4. Opcionalmente escrever contexto específico.
5. Opcionalmente escolher até 8 posts reais sincronizados do Instagram como referências diretas. Os selecionados são tratados como um conjunto de referências de mesma prioridade.
6. Opcionalmente habilitar o Drive e escolher exatamente quais mídias podem ser usadas. Para Reel, selecione vários vídeos e, se quiser, uma faixa de áudio dedicada.
7. Gerar a V1. Em Reel, o backend analisa a referência em vídeo, o footage e a faixa de áudio antes de criar a timeline.
8. No workbench, pedir alterações em linguagem natural. Cada pedido cria V2/V3/... sem sobrescrever as versões anteriores.
9. Escolher uma versão e clicar em **Enviar ao Figma**. Somente essa versão entra na fila.
10. No Figma, executar o plugin interno `Inteli Academy Content Bridge`. O plugin cria frames editáveis em `Academy • Gerações` e devolve os node IDs ao backend.
11. Revisar e editar livremente os frames no Figma.
12. Para Reel, o workbench renderiza o MP4 final a partir da timeline v2 + estado atual do Figma e executa QA sobre frames do próprio MP4. Se o QA falhar, a versão não pode ser publicada.
13. Aprovar e publicar. O servidor relê o estado/versão atual do Figma no momento da publicação; Reel publica exatamente o MP4 aprovado e bloqueia publicação se o Figma mudou depois do render.

## Formatos

- `single`: 1 frame 1080×1350; publicação de imagem única.
- `carousel`: 2–10 frames 1080×1350; publicação em ordem.
- `story`: 1 frame 1080×1920; o frame final do Figma é publicado.
- `reel`: timeline v2 1080×1920 com 6–12 shots de vários vídeos, source in/out limitados pela duração real do Drive, focal tracking por shot, tipografia curta, áudio dos takes ou uma trilha dedicada, cortes alinhados a beats/accentos e brand layers derivados do Figma. O Reel só é publicável quando timeline QA + render QA passam e o MP4 final está associado à mesma versão atual do Figma.

### Pipeline de Reel

1. **Referência real**: se um Reel do Instagram foi selecionado, o sistema analisa o vídeo real para obter duração, shot boundaries, motion, energia, texto e acentos/beat timestamps. Se não conseguir analisar a referência escolhida, a geração falha em vez de fingir fidelidade.
2. **Footage**: cada vídeo do Drive é analisado para encontrar segmentos fortes e ponto focal inicial/final. O fallback, quando necessário, continua preso aos metadados reais do arquivo.
3. **Música**: quando há faixa de áudio dedicada, a faixa é analisada para obter BPM aproximado e beats úteis. O sistema não declara edição no beat se não conseguir analisar a faixa.
4. **Editing plan**: são escolhidos 6–12 shots, com duração variável, variedade de vídeos e cortes encaixados na grade rítmica.
5. **Timeline executável**: cada shot guarda `sourceStartFrame`, `sourceEndFrame`, crop/focal tracking, posição temporal e áudio; `StyleSummary` não substitui essa timeline.
6. **Figma**: logo, decoração e tipografia vêm dos nodes reais sincronizados pelo plugin; Remotion não recria a marca com elementos hardcoded.
7. **Render final**: FFmpeg gera H.264/AAC a partir da mesma timeline, aplicando trims, focal tracking e layers do Figma.
8. **QA do render**: frames reais do MP4 são comparados visualmente com o estado aprovado do Figma. O antigo score estrutural sozinho nunca libera um Reel.
9. **Publicação**: somente o MP4 final aprovado é enviado ao Instagram. Footage bruto nunca é usado como fallback silencioso.

## Google Drive

O Drive usa OAuth com escopo somente leitura. Configure um OAuth Web Client e registre exatamente o callback exibido em **Configurações → Google Drive**:

`<NEXT_PUBLIC_APP_URL>/api/drive/callback`

Variáveis:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

A plataforma percorre a pasta raiz e subpastas, lista imagens, vídeos e áudio compatíveis e não altera nenhum arquivo. Para vídeo/áudio, também lê `durationMillis`; para vídeo, lê largura e altura. Esses metadados são usados para validar os limites reais de source in/out.

## Figma Content Bridge

Arquivos:

- `figma-plugin/manifest.json`
- `figma-plugin/code.js`
- `figma-plugin/ui.html`

Instalação local no Figma Desktop:

1. Plugins → Development → Import plugin from manifest.
2. Selecionar `figma-plugin/manifest.json`.
3. Executar o plugin dentro do arquivo ID Academy.
4. Abrir **Configurações → Figma** no Content Studio.
5. Copiar a URL da plataforma e o código de pareamento temporário exibidos ali.
6. Colar ambos no `Inteli Academy Content Bridge` e clicar em **Conectar e importar**.
7. Depois do primeiro pareamento, o token do bridge fica salvo no armazenamento local do plugin; um novo código só é necessário quando a credencial precisar ser renovada.

O plugin nunca recebe `FIGMA_ACCESS_TOKEN`. Esse token é somente do servidor e serve para consultar/renderizar o estado final do arquivo Figma.

O código de pareamento também não revela um segredo permanente. O backend valida o código temporário e emite uma credencial de bridge assinada. `FIGMA_PLUGIN_SECRET`, quando configurado, funciona como segredo dedicado de assinatura; quando omitido, o backend usa `CRON_SECRET` como fallback server-side.

## Variáveis de Figma

- `FIGMA_ACCESS_TOKEN`
- `FIGMA_FILE_KEY=xFV6r1G9gMjWvLf7gqyuYo`
- `FIGMA_OUTPUT_PAGE_NAME=Academy • Gerações`
- `FIGMA_PLUGIN_SECRET` — opcional; nunca deve ser compartilhado com o usuário do plugin

## Instagram

A conta profissional é conectada pela área **Configurações** usando Instagram API with Instagram Login / Business Login for Instagram.

Configurações novas devem usar:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `META_GRAPH_VERSION`
- `INSTAGRAM_BUSINESS_LOGIN_URL` apenas quando for necessário usar uma URL de Business Login fornecida explicitamente pela Meta.

Scopes solicitados pelo backend:

```text
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_insights
```

Callback OAuth:

`<NEXT_PUBLIC_APP_URL>/api/instagram/callback`

Cadastre na Meta exatamente o callback mostrado em **Configurações → Instagram**. Em apps ainda em desenvolvimento, a conta profissional usada no teste precisa ter o papel necessário no app — normalmente `Instagram Tester` — e o convite precisa ser aceito pela própria conta.

O Content Studio sincroniza os posts recentes para `instagram_reference_posts`. A análise visual/temporal é feita quando um post é escolhido como referência e fica em cache. Em uma geração com múltiplas referências, o modelo procura padrões comuns e combina apenas elementos compatíveis com a identidade da Academy; nenhum post é automaticamente tratado como principal.

Publicação manual do Content Studio sempre exige aprovação explícita no workbench. O pipeline semanal legado continua separado.

## Modelo de dados

- `instagram_reference_posts`: cache de posts reais e análise visual/temporal.
- `drive_connections`: OAuth criptografado do Drive.
- `content_projects`: brief, artigos opcionais, lista de referências do Instagram, assets autorizados, versão escolhida e publicação final.
- `content_versions`: V1/V2/V3 preservadas; o payload estruturado contém Scene Graph, Reel editing plan, timeline, QA e referência ao MP4 final aprovado.
- `figma_jobs`: fila de importação do plugin e node IDs retornados.
- bucket `studio-renders`: MP4s finais de Reel, endereçados por hash e versionados por projeto/versão.

`content_projects.instagram_reference_media_ids` guarda a lista atual de referências. O campo singular legado é mantido com a primeira referência apenas para compatibilidade com projetos/versões anteriores.

## Segurança e gates

- tokens OAuth são criptografados com `APP_ENCRYPTION_KEY`;
- segredos permanecem server-side;
- o proxy público de vídeo do Drive exige HMAC e confirma que o arquivo pertence ao projeto;
- o bridge do Figma usa credencial assinada obtida por pareamento temporário; o usuário não precisa conhecer o segredo interno do servidor;
- todas as tabelas do Content Studio usam RLS;
- sem artigos, `factualClaims` devem permanecer vazias e são validadas no backend;
- com artigos, cada `factualClaim.sourceUrl` deve pertencer exatamente ao conjunto de artigos selecionados;
- Reel exige 6–12 shots, source bounds válidos, áudio, focal tracking e correspondência entre plano semântico e timeline executável;
- com música dedicada, o QA exige beats detectados na própria faixa e mede o alinhamento dos cortes à grade;
- um Reel só pode ser publicado após `reelQuality.passed`, `renderQa.passed` e existência de `renderedReel`;
- a publicação consulta a versão atual do Figma e rejeita um MP4 renderizado antes de uma edição manual posterior;
- `ffmpeg-static@5.2.0` é o único install script adicional explicitamente aprovado para o renderer; o `postinstall` falha se o binário não existir, evitando uma falha tardia no primeiro render;
- os caminhos temporários usados para montar mídia em runtime são excluídos do tracing do Turbopack, evitando empacotar o repositório inteiro na função de render.
