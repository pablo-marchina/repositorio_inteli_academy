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
6. Opcionalmente habilitar o Drive e escolher exatamente quais imagens/vídeos podem ser usados.
7. Gerar a V1.
8. No workbench, pedir alterações em linguagem natural. Cada pedido cria V2/V3/... sem sobrescrever as versões anteriores.
9. Escolher uma versão e clicar em **Enviar ao Figma**. Somente essa versão entra na fila.
10. No Figma, executar o plugin interno `Inteli Academy Content Bridge`. O plugin cria frames editáveis em `Academy • Gerações` e devolve os node IDs ao backend.
11. Revisar e editar livremente os frames no Figma.
12. Voltar ao workbench e clicar em **Aprovar Figma e publicar no Instagram**.
13. O servidor consulta/exporta novamente os node IDs atuais do Figma naquele momento e só então publica.

## Formatos

- `single`: 1 frame 1080×1350; publicação de imagem única.
- `carousel`: 2–10 frames 1080×1350; publicação em ordem.
- `story`: 1 frame 1080×1920; o frame final do Figma é publicado.
- `reel`: vídeo explicitamente escolhido no Drive. O frame 1080×1920 é criado/revisado no Figma como direção/capa visual, mas o endpoint de publicação envia o vídeo selecionado como mídia do Reel.

## Google Drive

O Drive usa OAuth com escopo somente leitura. Configure um OAuth Web Client e registre:

`<NEXT_PUBLIC_APP_URL>/api/drive/callback`

Variáveis:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

A plataforma percorre a pasta raiz e subpastas, lista somente imagens/vídeos e não altera nenhum arquivo.

## Figma Content Bridge

Arquivos:

- `figma-plugin/manifest.json`
- `figma-plugin/code.js`
- `figma-plugin/ui.html`

Instalação local no Figma Desktop:

1. Plugins → Development → Import plugin from manifest.
2. Selecionar `figma-plugin/manifest.json`.
3. Executar o plugin dentro do arquivo ID Academy.
4. Informar a URL da aplicação e o mesmo valor configurado em `FIGMA_PLUGIN_SECRET`.
5. Importar a próxima versão escolhida.

O plugin nunca recebe `FIGMA_ACCESS_TOKEN`. Esse token é somente do servidor e serve para consultar/renderizar o estado final.

## Variáveis de Figma

- `FIGMA_ACCESS_TOKEN`
- `FIGMA_FILE_KEY=xFV6r1G9gMjWvLf7gqyuYo`
- `FIGMA_OUTPUT_PAGE_NAME=Academy • Gerações`
- `FIGMA_PLUGIN_SECRET`

## Instagram

A conta profissional continua conectada pela área Configurações. O Content Studio sincroniza os posts recentes para `instagram_reference_posts`. A análise visual é feita quando um post é escolhido como referência e fica em cache. Em uma geração com múltiplas referências, o modelo procura padrões comuns e combina apenas elementos compatíveis com a identidade da Academy; nenhum post é automaticamente tratado como principal.

Publicação manual do Content Studio sempre exige aprovação explícita no workbench. O pipeline semanal legado continua separado.

## Modelo de dados

- `instagram_reference_posts`: cache de posts reais e análise visual.
- `drive_connections`: OAuth criptografado do Drive.
- `content_projects`: brief, artigos opcionais, lista de referências do Instagram, versão escolhida e publicação final.
- `content_versions`: V1/V2/V3 preservadas e parent version.
- `figma_jobs`: fila de importação do plugin e node IDs retornados.

`content_projects.instagram_reference_media_ids` guarda a lista atual de referências. O campo singular legado é mantido com a primeira referência apenas para compatibilidade com projetos/versões anteriores.

## Segurança

- tokens OAuth são criptografados com `APP_ENCRYPTION_KEY`;
- segredos permanecem server-side;
- o proxy público de vídeo do Drive exige HMAC e confirma que o arquivo pertence ao projeto;
- o bridge do Figma exige `FIGMA_PLUGIN_SECRET`;
- todas as tabelas do Content Studio usam RLS;
- sem artigos, `factualClaims` devem permanecer vazias e são validadas no backend;
- com artigos, cada `factualClaim.sourceUrl` deve pertencer exatamente ao conjunto de artigos selecionados;
- a publicação lê o Figma novamente no momento da aprovação, evitando publicar um render antigo depois de uma edição manual.
