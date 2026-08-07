# Instagram historical style fidelity

## Goal

Generated Instagram carousels should look like posts already produced by Inteli Academy, not like arbitrary recombinations of every visual token found anywhere in the ID Academy Figma file.

The full `figma-full-v1` inventory remains the source-of-truth whitelist for brand assets, but Instagram rendering now uses a much narrower historical grammar derived from actual Social Media compositions.

## Historical references

The renderer was calibrated against these audited Figma frames from the `Social Media` page of file `xFV6r1G9gMjWvLf7gqyuYo`:

- `769:8` — Workshop Tractian
- `813:232` — Happy Hour Segura
- `393:101` — Workshop Rivio
- `1205:136` — BTG case carousel
- `1019:2` — Inteli Academy x Estímulo carousel

## Repeated visual grammar

The observed feed posts consistently favor:

- 1080 × 1350 feed format
- small centered or restrained `IA` wordmark
- white/off-white canvas with large whitespace
- institutional blue (`#2A00FF`) as the dominant accent
- restrained pale lavender atmosphere rather than saturated multi-color gradients
- editorial serif display paired with a clean sans-serif body
- large, calm typography with low information density
- hand-drawn underline/corner details primarily on covers
- numbered/list structures for internal information slides
- black closing slide with centered white CTA and blue accent
- photography, when present, used as a dominant element rather than a small decoration

## What is intentionally prohibited in generated Instagram rendering

Even though the following resources exist elsewhere in the complete Figma file, the historical Instagram renderer does not use them unless a future audited Social Media template demonstrates the same usage:

- robot/product mockup motifs
- packaging and keycap illustrations
- shader treatments
- glass panels
- sticker sheets
- dense collage treatments
- arbitrary rainbow/magenta/orange gradients
- arbitrary combinations of page-specific motifs from Products, Creative Deposit, Presentations, Calendar, Totems, or stock-photo exploration pages

This distinction is important: **present somewhere in Figma remains necessary for the global whitelist, but it is no longer sufficient for Instagram style selection.**

## Rendering architecture

```text
Gemini editorial content
        ↓
validated post/slide data
        ↓
historical Instagram renderer
        ↓
layout archetype selected from semantic slide role
        ↓
1080×1350 ImageResponse
```

Gemini no longer has effective control over the final visual combination at render time. Its generated `backgroundColor`, `gradient`, `motif`, `effect`, `visualElements`, and other generic visual fields are ignored by the Instagram publishing renderer. They remain in stored post data for backwards compatibility and auditability.

## Historical archetypes

### Cover

- off-white background
- pale lavender atmosphere
- centered IA wordmark
- Canela-like blue title
- hand-drawn blue underline
- small corner marks
- subtle ghost typography near the bottom

### Editorial content

- white/off-white background
- small IA header
- blue editorial headline
- black sans-serif explanation
- numbered rows for bullets
- restrained pale background atmosphere

### Stat

- oversized blue serif statistic
- blue rule
- black explanatory label/body

### Quote

- large blue editorial quotation
- minimal secondary body text

### CTA

- black full background
- centered white message
- restrained blue accent/bottom rule

## Backwards compatibility

Stored post records and the existing generic renderer are not deleted. Only the Instagram image endpoint is switched to the historical renderer. Already published Instagram media is unaffected.
