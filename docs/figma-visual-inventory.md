# Inventário visual fechado do Figma ID Academy

Versão do contrato: `figma-full-v1`

Fonte auditada em modo somente leitura em 6 de agosto de 2026:

```text
https://www.figma.com/design/xFV6r1G9gMjWvLf7gqyuYo/ID-Academy
```

Nenhuma página, camada, componente ou asset do Figma foi modificado.

## Páginas analisadas

| Página | ID | Nós analisados |
|---|---:|---:|
| Apresentações | `0:1` | 1.439 |
| Calendário | `1177:2` | 510 |
| teste | `671:28` | 128 |
| Creative Deposit | `260:580` | 86 |
| Social Media | `259:251` | 3.410 |
| Produtos | `446:5` | 232 |
| Totens | `213:2` | 284 |
| stock photos | `9:131` | 69 |
| **Total** |  | **6.158** |

## Regra do contrato

A geração usa uma whitelist fechada:

```text
elemento ou valor observado no Figma → pode ser selecionado
elemento ou valor ausente do Figma → schema rejeita
```

A whitelist é implementada em `lib/figma-visual-system.ts`. O schema estruturado do Gemini usa os mesmos enums e a revisão programática repete a validação antes da aprovação.

## O que foi inventariado

- cores sólidas e opacidades;
- gradientes lineares e radiais;
- famílias tipográficas e pesos;
- tamanhos de texto;
- raios de canto;
- espessuras de stroke;
- sombras, inner shadow, blur, glass e shader;
- modos de imagem `FILL`, `FIT` e `CROP` e presença de vídeo;
- frames, grupos, retângulos, elipses, vetores, linhas, boolean operations, text paths, connectors, components e instances;
- formatos de apresentação, calendário, post, story, banner, produto e totem;
- composições editoriais, pôsteres, grids modulares, colagens, layouts full-bleed, calendários, mockups e sticker sheets;
- elementos como brackets, órbitas, grids, faixas, molduras, orbs, glass cards, stickers, stamps, text paths, connectors, QR codes, calendários, recortes de imagem, mockups de produto, robôs 3D, embalagens 3D, washi tape, keycaps e textura de parede.

## Paleta

A whitelist contém todas as cores sólidas detectadas nas oito páginas, incluindo:

- núcleo institucional: `#2A00FF`, `#272727`, `#0A0A14`, `#FFFFFF`, `#000000`;
- neutros e superfícies: `#F5F5F7`, `#F0F0F0`, `#E6E6EC`, `#D9D9D9`, `#5A5A66`;
- azuis e violetas: `#441EFF`, `#5F40FF`, `#6344FF`, `#4A73FF`, `#5C72FB`, `#9581F6`;
- acentos presentes: rosa, magenta, vermelho, laranja, amarelo, verde, ciano e lilás;
- todas as variações restantes estão enumeradas diretamente em `FIGMA_COLORS`.

Cores que existiam no código mas não apareceram na auditoria foram removidas. Por exemplo, a superfície padrão passou de `#F4F3F8` para `#F5F5F7`, e a linha padrão de `#D8D6E0` para `#E6E6EC`.

## Tipografia

Famílias detectadas e liberadas:

```text
Figtree
Inter
Canela Deck Trial
SF Pro
Roboto
Manrope
Poppins
Arial
GT America
Apple Garamond
Playfair Display
Erode Variable
Libre Baskerville
Neulis
Switzer Variable
Plantagenet Cherokee
Hiragino Kaku Gothic Std
Geist Mono
```

Nenhum arquivo de fonte foi copiado ou incorporado ao repositório. O renderer usa o nome observado como primeira opção e fallbacks formados apenas por famílias também detectadas no Figma, além da categoria genérica final necessária ao ambiente de renderização.

## Efeitos permitidos

```text
none
drop-shadow-soft
drop-shadow-medium
drop-shadow-large
inner-shadow
layer-blur-soft
layer-blur-medium
layer-blur-large
glass-0
glass-4
glass-10
shader
```

Esses tokens correspondem aos tipos de efeito encontrados no arquivo. O renderer usa representações estáticas compatíveis com `ImageResponse`.

## Mídia

Tratamentos liberados:

```text
none
fill
fit
crop
video-still
```

A whitelist cobre o tratamento visual observado. Imagens específicas do Figma não são copiadas automaticamente para o produto; mídia factual ou editorial deve vir de um asset autorizado da aplicação. Isso evita transformar o arquivo de identidade em um repositório implícito de imagens.

## Estrutura do post

- 6 a 9 slides;
- capa obrigatória;
- desenvolvimento narrativo;
- CTA final obrigatório;
- fontes mantidas na legenda e em `factualClaims`;
- nenhum slide de fontes obrigatório;
- até quatro elementos decorativos declarados por slide;
- todo valor visual precisa pertencer à whitelist.

## Camadas de proteção

1. O Gemini recebe JSON Schema com enums fechados.
2. O parser Zod rejeita valores externos.
3. `programmaticReview` revalida cada campo.
4. A revisão editorial instrui reprovação de elementos fora do contrato.
5. O renderer só implementa os tokens enumerados.

O contrato pode ser atualizado no futuro somente após nova auditoria explícita do Figma e atualização versionada do inventário.
