import React from "react";
import { brand } from "@/lib/brand";
import {
  FIGMA_GRADIENTS,
  FIGMA_TYPEFACE_CSS,
  type FigmaVisualElement
} from "@/lib/figma-visual-system";
import type { PostSlide } from "@/lib/types";

const base: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "hidden",
  fontFamily: brand.typography.sans
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9A-F]{6}$/i.test(normalized)) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isDarkColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.48;
}

function legacyBackground(slide: PostSlide) {
  if (slide.accent === "black") return brand.colors.black;
  if (slide.accent === "white") return brand.colors.soft;
  return slide.layout === "cover" || slide.layout === "cta" ? brand.colors.blue : brand.colors.soft;
}

function palette(slide: PostSlide) {
  const backgroundColor = slide.backgroundColor ?? legacyBackground(slide);
  const dark = isDarkColor(backgroundColor);
  const foreground = slide.foregroundColor ?? (dark ? brand.colors.white : brand.colors.black);
  const accent = slide.accentColor ?? brand.colors.blue;
  const gradient = slide.gradient && slide.gradient !== "none" ? FIGMA_GRADIENTS[slide.gradient] : null;
  return {
    dark,
    background: gradient ?? backgroundColor,
    backgroundColor,
    foreground,
    accent,
    muted: withAlpha(foreground, 0.72),
    line: withAlpha(foreground, 0.24)
  };
}

function tokenNumber(value: string | undefined, fallback: number, maximum = 900) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(0, parsed)) : fallback;
}

function typeface(slide: PostSlide, title: boolean) {
  const token = title ? slide.titleTypeface : slide.bodyTypeface;
  if (token) return FIGMA_TYPEFACE_CSS[token];
  if (title && slide.titleStyle === "serif") return brand.typography.display;
  if (title && slide.titleStyle === "mixed") return brand.typography.display;
  return brand.typography.sans;
}

function safeTitleSize(slide: PostSlide, fallback: number) {
  const requested = tokenNumber(slide.titleSize, fallback, 800);
  if (slide.title.length > 48) return Math.min(requested, 72);
  if (slide.title.length > 30) return Math.min(requested, 85);
  if (slide.title.length > 18) return Math.min(requested, 110);
  return requested;
}

function bodySize(slide: PostSlide, fallback: number) {
  const requested = tokenNumber(slide.bodySize, fallback, 96);
  if ((slide.body?.length ?? 0) > 180) return Math.min(requested, 28);
  if ((slide.body?.length ?? 0) > 90) return Math.min(requested, 32);
  return requested;
}

function effectStyle(slide: PostSlide): React.CSSProperties {
  if (slide.effect === "drop-shadow-soft") return { boxShadow: "0 8px 24px rgba(0,0,0,.16)" };
  if (slide.effect === "drop-shadow-medium") return { boxShadow: "0 18px 48px rgba(0,0,0,.22)" };
  if (slide.effect === "drop-shadow-large") return { boxShadow: "0 30px 82px rgba(0,0,0,.28)" };
  if (slide.effect === "inner-shadow") return { boxShadow: "inset 0 0 24px rgba(0,0,0,.24)" };
  return {};
}

function Mark({ foreground, accent, compact = false }: { foreground: string; accent: string; compact?: boolean }) {
  const size = compact ? 64 : 80;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: compact ? 18 : 22,
        background: accent,
        color: foreground,
        fontFamily: FIGMA_TYPEFACE_CSS.figtree,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: compact ? 28 : 36,
        letterSpacing: -4
      }}
    >
      IA
    </div>
  );
}

function QrGrid({ color, background }: { color: string; background: string }) {
  const active = new Set([0, 1, 2, 4, 6, 8, 10, 11, 12, 14, 15, 17, 18, 20, 22, 23, 24]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: 150, height: 150, padding: 8, background, borderRadius: 10 }}>
      {Array.from({ length: 25 }).map((_, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            width: 26,
            height: 26,
            background: active.has(index) ? color : background
          }}
        />
      ))}
    </div>
  );
}

function DecorativeElement({
  element,
  slide,
  index = 0
}: {
  element: FigmaVisualElement;
  slide: PostSlide;
  index?: number;
}) {
  const p = palette(slide);
  const radius = tokenNumber(slide.cornerRadius, 24, 300);
  const stroke = Math.max(1, tokenNumber(slide.strokeWeight, 2, 25));
  const anchors = [
    { right: -70, top: 215 },
    { left: -80, bottom: 170 },
    { right: 70, bottom: 145 },
    { left: 80, top: 245 }
  ];
  const anchor = anchors[index % anchors.length];
  const shared: React.CSSProperties = { display: "flex", position: "absolute", zIndex: 1, ...anchor };

  if (element === "rectangle") {
    return <div style={{ ...shared, width: 330, height: 150, borderRadius: radius, background: p.accent, opacity: 0.2 }} />;
  }
  if (element === "ellipse") {
    return <div style={{ ...shared, width: 290, height: 290, borderRadius: 900, border: `${stroke}px solid ${withAlpha(p.foreground, 0.42)}` }} />;
  }
  if (element === "vector-mark") {
    return <div style={{ ...shared, width: 155, height: 155, transform: "rotate(45deg)", border: `${stroke}px solid ${p.accent}`, background: withAlpha(p.accent, 0.08) }} />;
  }
  if (element === "line") {
    return <div style={{ ...shared, width: 360, height: stroke, background: p.foreground, opacity: 0.5, transform: "rotate(-18deg)" }} />;
  }
  if (element === "gradient-field") {
    return <div style={{ ...shared, width: 390, height: 390, borderRadius: 900, background: FIGMA_GRADIENTS[slide.gradient ?? "blue-white-radial"], opacity: 0.48 }} />;
  }
  if (element === "blurred-orbs") {
    return (
      <div style={{ ...shared, width: 420, height: 420 }}>
        <div style={{ display: "flex", position: "absolute", width: 300, height: 300, borderRadius: 900, background: withAlpha(p.accent, 0.34), left: 0, top: 0 }} />
        <div style={{ display: "flex", position: "absolute", width: 250, height: 250, borderRadius: 900, background: withAlpha(p.foreground, 0.18), right: 0, bottom: 0 }} />
      </div>
    );
  }
  if (element === "glass-card") {
    return <div style={{ ...shared, width: 360, height: 220, borderRadius: radius, background: withAlpha(p.foreground, 0.1), border: `${stroke}px solid ${withAlpha(p.foreground, 0.36)}`, boxShadow: "0 18px 48px rgba(0,0,0,.14)" }} />;
  }
  if (element === "sticker") {
    return (
      <div style={{ ...shared, alignItems: "center", justifyContent: "center", width: 230, height: 100, borderRadius: 30, background: p.foreground, color: p.backgroundColor, transform: "rotate(-10deg)", fontFamily: FIGMA_TYPEFACE_CSS.figtree, fontSize: 30, fontWeight: 800, border: `${stroke}px solid ${p.accent}` }}>
        INTELI
      </div>
    );
  }
  if (element === "stamp") {
    return (
      <div style={{ ...shared, alignItems: "center", justifyContent: "center", width: 220, height: 220, borderRadius: 900, border: `${Math.max(3, stroke)}px solid ${p.accent}`, color: p.accent, fontFamily: FIGMA_TYPEFACE_CSS["canela-deck"], fontSize: 68, fontWeight: 700, transform: "rotate(12deg)" }}>
        IA
      </div>
    );
  }
  if (element === "text-path") {
    return <div style={{ ...shared, width: 540, fontFamily: FIGMA_TYPEFACE_CSS.figtree, fontSize: 34, fontWeight: 700, letterSpacing: 5, color: p.foreground, opacity: 0.5, transform: "rotate(-24deg)" }}>INTELI ACADEMY · INTELIGÊNCIA ARTIFICIAL ·</div>;
  }
  if (element === "connector") {
    return (
      <div style={{ ...shared, width: 350, height: 210 }}>
        <div style={{ display: "flex", position: "absolute", left: 28, right: 28, top: 100, height: stroke, background: p.foreground, opacity: 0.5 }} />
        {[28, 160, 292].map((left) => <div key={left} style={{ display: "flex", position: "absolute", left, top: 78, width: 46, height: 46, borderRadius: 900, background: p.accent, border: `${stroke}px solid ${p.foreground}` }} />)}
      </div>
    );
  }
  if (element === "qr-code") {
    return <div style={shared}><QrGrid color={p.foreground} background={p.backgroundColor} /></div>;
  }
  if (element === "calendar-grid") {
    return (
      <div style={{ ...shared, width: 350, height: 300, flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: 28 }).map((_, cell) => <div key={cell} style={{ display: "flex", width: 42, height: 42, borderRadius: 8, background: cell % 5 === 0 ? p.accent : withAlpha(p.foreground, 0.12), border: `${stroke}px solid ${withAlpha(p.foreground, 0.24)}` }} />)}
      </div>
    );
  }
  if (element === "image-cutout" || element === "photo-frame") {
    return (
      <div style={{ ...shared, width: 390, height: 330 }}>
        <div style={{ display: "flex", position: "absolute", width: 260, height: 300, left: 0, top: 20, borderRadius: radius, background: FIGMA_GRADIENTS["blue-periwinkle-linear"], transform: "rotate(-7deg)", border: `${stroke}px solid ${p.foreground}` }} />
        <div style={{ display: "flex", position: "absolute", width: 260, height: 300, right: 0, top: 0, borderRadius: radius, background: FIGMA_GRADIENTS["pink-blue-linear"], transform: "rotate(8deg)", border: `${stroke}px solid ${p.foreground}` }} />
      </div>
    );
  }
  if (element === "product-mockup") {
    return (
      <div style={{ ...shared, alignItems: "center", justifyContent: "center", width: 300, height: 370, borderRadius: 40, background: p.foreground, color: p.backgroundColor, border: `${stroke}px solid ${p.accent}`, transform: "rotate(4deg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 190, height: 190, borderRadius: 900, background: p.accent, color: p.foreground, fontSize: 66, fontWeight: 900 }}>IA</div>
      </div>
    );
  }
  if (element === "robot-3d") {
    return (
      <div style={{ ...shared, width: 300, height: 360, alignItems: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", width: 210, height: 170, borderRadius: 55, background: p.foreground, border: `${stroke}px solid ${p.accent}`, alignItems: "center", justifyContent: "space-around", padding: 32 }}>
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 900, background: p.accent }} />
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 900, background: p.accent }} />
        </div>
        <div style={{ display: "flex", width: 250, height: 160, marginTop: 12, borderRadius: 48, background: withAlpha(p.foreground, 0.9), alignItems: "center", justifyContent: "center", color: p.backgroundColor, fontSize: 48, fontWeight: 900 }}>IA</div>
      </div>
    );
  }
  if (element === "packaging-3d") {
    return (
      <div style={{ ...shared, width: 300, height: 390, flexWrap: "wrap", gap: 18, padding: 32, borderRadius: 40, background: withAlpha(p.foreground, 0.18), border: `${stroke}px solid ${p.foreground}` }}>
        {Array.from({ length: 6 }).map((_, cell) => <div key={cell} style={{ display: "flex", width: 102, height: 102, borderRadius: 900, background: cell % 2 ? p.accent : p.foreground, boxShadow: "0 8px 20px rgba(0,0,0,.18)" }} />)}
      </div>
    );
  }
  if (element === "washi-tape") {
    return <div style={{ ...shared, width: 430, height: 105, background: FIGMA_GRADIENTS["periwinkle-magenta-orange-linear"], opacity: 0.82, transform: "rotate(-18deg)", border: `${stroke}px solid ${withAlpha(p.foreground, 0.5)}` }} />;
  }
  if (element === "keycap") {
    return <div style={{ ...shared, alignItems: "center", justifyContent: "center", width: 210, height: 210, borderRadius: 30, background: p.foreground, color: p.backgroundColor, border: `${Math.max(4, stroke)}px solid ${p.accent}`, boxShadow: "0 18px 0 rgba(0,0,0,.22)", fontSize: 72, fontWeight: 900 }}>AI</div>;
  }
  if (element === "street-wall") {
    return (
      <div style={{ ...shared, width: 470, height: 330, flexDirection: "column", gap: 12, opacity: 0.28, transform: "rotate(-4deg)" }}>
        {Array.from({ length: 10 }).map((_, row) => <div key={row} style={{ display: "flex", height: 18, width: row % 2 ? 390 : 455, background: p.foreground }} />)}
      </div>
    );
  }
  if (element === "component-card") {
    return <div style={{ ...shared, width: 350, height: 240, borderRadius: radius, background: p.foreground, border: `${stroke}px solid ${p.accent}`, boxShadow: "0 18px 48px rgba(0,0,0,.18)" }} />;
  }
  if (element === "text-label") {
    return <div style={{ ...shared, alignItems: "center", justifyContent: "center", minWidth: 210, height: 66, padding: "0 26px", borderRadius: 900, background: p.accent, color: p.foreground, fontSize: 25, fontWeight: 800 }}>AI WEEKLY</div>;
  }
  return <div style={{ ...shared, fontFamily: FIGMA_TYPEFACE_CSS["canela-deck"], fontSize: 250, lineHeight: 1, color: withAlpha(p.foreground, 0.1), fontStyle: "italic" }}>{String(slide.position).padStart(2, "0")}</div>;
}

function Motif({ slide }: { slide: PostSlide }) {
  const p = palette(slide);
  const motif = slide.motif ?? "frame";
  const color = withAlpha(p.foreground, 0.24);
  const stroke = Math.max(1, tokenNumber(slide.strokeWeight, 3, 25));
  const radius = tokenNumber(slide.cornerRadius, 34, 300);

  if (motif === "orbit") {
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0 }}>
        <div style={{ display: "flex", position: "absolute", width: 620, height: 620, borderRadius: 900, border: `${stroke}px solid ${color}`, right: -170, top: 190 }} />
        <div style={{ display: "flex", position: "absolute", width: 360, height: 360, borderRadius: 900, border: `2px solid ${color}`, right: -30, top: 320 }} />
        <div style={{ display: "flex", position: "absolute", width: 34, height: 34, borderRadius: 900, background: p.accent, right: 206, top: 305 }} />
      </div>
    );
  }
  if (motif === "grid") {
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0, opacity: 0.55 }}>
        {Array.from({ length: 7 }).map((_, index) => <div key={`v-${index}`} style={{ display: "flex", position: "absolute", width: 1, height: 1120, background: color, left: 70 + index * 156, top: 88 }} />)}
        {Array.from({ length: 7 }).map((_, index) => <div key={`h-${index}`} style={{ display: "flex", position: "absolute", height: 1, width: 940, background: color, left: 70, top: 108 + index * 164 }} />)}
      </div>
    );
  }
  if (motif === "ribbon") {
    return <div style={{ display: "flex", position: "absolute", width: 760, height: 170, background: p.accent, opacity: 0.28, right: -250, top: 280, transform: "rotate(-23deg)" }} />;
  }
  if (motif === "brackets") {
    const bracket: React.CSSProperties = { display: "flex", position: "absolute", width: 100, height: 100 };
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0 }}>
        <div style={{ ...bracket, left: 42, top: 42, borderLeft: `${stroke}px solid ${color}`, borderTop: `${stroke}px solid ${color}` }} />
        <div style={{ ...bracket, right: 42, top: 42, borderRight: `${stroke}px solid ${color}`, borderTop: `${stroke}px solid ${color}` }} />
        <div style={{ ...bracket, left: 42, bottom: 42, borderLeft: `${stroke}px solid ${color}`, borderBottom: `${stroke}px solid ${color}` }} />
        <div style={{ ...bracket, right: 42, bottom: 42, borderRight: `${stroke}px solid ${color}`, borderBottom: `${stroke}px solid ${color}` }} />
      </div>
    );
  }
  if (motif === "frame") {
    return <div style={{ display: "flex", position: "absolute", inset: 38, border: `${stroke}px solid ${color}`, borderRadius: radius }} />;
  }
  if (motif === "none") return null;
  const mapped = motif === "glass-panels" ? "glass-card" : motif;
  return <DecorativeElement element={mapped as FigmaVisualElement} slide={slide} index={0} />;
}

function EffectLayer({ slide }: { slide: PostSlide }) {
  const p = palette(slide);
  if (slide.effect === "shader") {
    return <div style={{ display: "flex", position: "absolute", inset: 0, background: FIGMA_GRADIENTS["periwinkle-magenta-orange-linear"], opacity: 0.18, zIndex: 0 }} />;
  }
  if (slide.effect?.startsWith("layer-blur")) {
    const size = slide.effect === "layer-blur-large" ? 560 : slide.effect === "layer-blur-medium" ? 380 : 240;
    return <div style={{ display: "flex", position: "absolute", width: size, height: size, right: -size / 3, top: 260, borderRadius: 900, background: withAlpha(p.accent, slide.effect === "layer-blur-large" ? 0.2 : 0.14), zIndex: 0 }} />;
  }
  if (slide.effect?.startsWith("glass")) {
    const opacity = slide.effect === "glass-10" ? 0.16 : slide.effect === "glass-4" ? 0.1 : 0.06;
    return <div style={{ display: "flex", position: "absolute", width: 470, height: 310, right: 60, top: 250, borderRadius: tokenNumber(slide.cornerRadius, 24, 300), background: withAlpha(p.foreground, opacity), border: `1px solid ${withAlpha(p.foreground, 0.28)}`, zIndex: 0 }} />;
  }
  return null;
}

function Header({ slide }: { slide: PostSlide }) {
  const p = palette(slide);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Mark foreground={p.foreground} accent={p.accent} compact />
        <span style={{ fontFamily: FIGMA_TYPEFACE_CSS.figtree, fontSize: 24, fontWeight: 800 }}>Inteli Academy</span>
      </div>
      <span style={{ fontFamily: typeface(slide, false), fontSize: 21, textTransform: "uppercase", letterSpacing: 3.2, opacity: 0.8 }}>{slide.eyebrow ?? "Inteligência artificial"}</span>
    </div>
  );
}

function Footer({ slide, total }: { slide: PostSlide; total: number }) {
  const p = palette(slide);
  return (
    <div style={{ display: "flex", position: "absolute", left: 70, right: 70, bottom: 48, justifyContent: "space-between", alignItems: "center", color: p.foreground, fontFamily: typeface(slide, false), fontSize: 23, zIndex: 5 }}>
      <span style={{ fontWeight: 700 }}>AI Weekly</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", width: 92, height: 2, background: p.foreground, opacity: 0.55 }} />
        <span>{String(slide.position).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

function titleSegments(title: string, highlight?: string) {
  if (!highlight) return [{ text: title, highlighted: false }];
  const start = title.toLocaleLowerCase("pt-BR").indexOf(highlight.toLocaleLowerCase("pt-BR"));
  if (start < 0) return [{ text: title, highlighted: false }];
  return [
    { text: title.slice(0, start), highlighted: false },
    { text: title.slice(start, start + highlight.length), highlighted: true },
    { text: title.slice(start + highlight.length), highlighted: false }
  ].filter((part) => part.text.length > 0);
}

function DisplayTitle({ slide, fallbackSize, centered = false }: { slide: PostSlide; fallbackSize: number; centered?: boolean }) {
  const p = palette(slide);
  const segments = titleSegments(slide.title, slide.highlight);
  const fontFamily = typeface(slide, true);
  const fontSize = safeTitleSize(slide, fallbackSize);
  const fontWeight = Number(slide.titleWeight ?? (slide.titleStyle === "serif" ? "500" : "800"));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: centered ? "center" : "flex-start", width: "100%", fontFamily, fontSize, lineHeight: 0.94, letterSpacing: -4.5, fontWeight, fontStyle: slide.titleItalic || slide.titleStyle === "serif" ? "italic" : "normal", textAlign: centered ? "center" : "left" }}>
      {segments.map((part, index) => (
        <span key={`${part.text}-${index}`} style={{ color: part.highlighted ? p.accent : p.foreground, marginRight: index < segments.length - 1 ? 14 : 0 }}>{part.text}</span>
      ))}
    </div>
  );
}

function BodyText({ slide, children, fallbackSize = 30 }: { slide: PostSlide; children: React.ReactNode; fallbackSize?: number }) {
  const p = palette(slide);
  return <div style={{ display: "flex", fontFamily: typeface(slide, false), fontSize: bodySize(slide, fallbackSize), lineHeight: 1.34, fontWeight: Number(slide.bodyWeight ?? "400"), fontStyle: slide.bodyItalic ? "italic" : "normal", color: p.muted }}>{children}</div>;
}

function BulletList({ slide, bullets, numbered = false }: { slide: PostSlide; bullets: string[]; numbered?: boolean }) {
  const p = palette(slide);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {bullets.slice(0, 4).map((bullet, index) => (
        <div key={`${bullet}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 18, fontFamily: typeface(slide, false), fontSize: bodySize(slide, 30), lineHeight: 1.28, fontWeight: Number(slide.bodyWeight ?? "400") }}>
          <span style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", width: numbered ? 48 : 18, height: numbered ? 48 : 18, marginTop: numbered ? -5 : 10, borderRadius: 900, background: p.accent, color: p.foreground, fontSize: numbered ? 19 : 1, fontWeight: 900 }}>{numbered ? String(index + 1).padStart(2, "0") : ""}</span>
          <span>{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ slide, total, children }: { slide: PostSlide; total: number; children: React.ReactNode }) {
  const p = palette(slide);
  return (
    <div style={{ ...base, background: p.background, color: p.foreground, padding: "64px 70px 126px", ...effectStyle(slide) }}>
      <EffectLayer slide={slide} />
      <Motif slide={slide} />
      {(slide.visualElements ?? []).map((element, index) => <DecorativeElement key={`${element}-${index}`} element={element} slide={slide} index={index + 1} />)}
      <Header slide={slide} />
      {children}
      <Footer slide={slide} total={total} />
    </div>
  );
}

export function renderSlide(slide: PostSlide, total: number) {
  const p = palette(slide);
  const bullets = slide.bullets ?? [];
  const radius = tokenNumber(slide.cornerRadius, 30, 300);
  const stroke = Math.max(1, tokenNumber(slide.strokeWeight, 2, 25));

  if (slide.layout === "sources") {
    const sources = (slide.sourceLabels ?? slide.bullets ?? []).slice(0, 8);
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 80, position: "relative", zIndex: 3 }}>
          <DisplayTitle slide={slide} fallbackSize={80} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 52, width: "92%" }}>
            {sources.map((source, index) => <div key={`${source}-${index}`} style={{ display: "flex", alignItems: "center", gap: 22, minHeight: 72, borderTop: `2px solid ${p.line}` }}><span style={{ width: 54, color: p.accent, fontWeight: 900, fontSize: 24 }}>{String(index + 1).padStart(2, "0")}</span><span style={{ fontSize: 28, lineHeight: 1.2 }}>{source}</span></div>)}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "stat") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 116, maxWidth: 900, position: "relative", zIndex: 3 }}>
          <span style={{ fontFamily: typeface(slide, true), fontSize: Math.max(150, safeTitleSize(slide, 224)), lineHeight: 0.78, fontWeight: Number(slide.titleWeight ?? "500"), fontStyle: slide.titleItalic ? "italic" : "normal", letterSpacing: -12 }}>{slide.stat ?? "IA"}</span>
          <span style={{ display: "flex", width: 210, height: 10, marginTop: 54, background: p.accent }} />
          <span style={{ fontFamily: typeface(slide, false), fontSize: 44, lineHeight: 1.08, marginTop: 34, fontWeight: 800 }}>{slide.statLabel ?? slide.title}</span>
          {slide.body ? <div style={{ display: "flex", marginTop: 34, maxWidth: 780 }}><BodyText slide={slide} fallbackSize={29}>{slide.body}</BodyText></div> : null}
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cards") {
    const items = bullets.slice(0, 4);
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 72, position: "relative", zIndex: 3 }}>
          <DisplayTitle slide={slide} fallbackSize={76} />
          {slide.body ? <div style={{ display: "flex", marginTop: 28, maxWidth: 850 }}><BodyText slide={slide} fallbackSize={28}>{slide.body}</BodyText></div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 44 }}>
            {items.map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: "flex", flexDirection: "column", width: items.length > 2 ? 459 : 936, minHeight: items.length > 2 ? 185 : 138, padding: "28px 30px", borderRadius: radius, background: withAlpha(p.foreground, p.dark ? 0.13 : 0.95), color: p.dark ? p.foreground : p.backgroundColor, border: `${stroke}px solid ${p.line}` }}>
                <span style={{ fontFamily: typeface(slide, true), fontStyle: "italic", fontSize: 34, color: p.accent }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ fontFamily: typeface(slide, false), fontSize: bodySize(slide, 28), lineHeight: 1.24, marginTop: 13 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "split") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", gap: 38, marginTop: 92, position: "relative", zIndex: 3, minHeight: 830 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 510 }}>
            <DisplayTitle slide={slide} fallbackSize={78} />
            {slide.body ? <div style={{ display: "flex", marginTop: 38 }}><BodyText slide={slide} fallbackSize={29}>{slide.body}</BodyText></div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 390, padding: "42px 34px", borderRadius: radius, background: p.accent, color: p.foreground, border: `${stroke}px solid ${p.foreground}` }}>
            <BulletList slide={{ ...slide, foregroundColor: p.foreground, backgroundColor: p.accent }} bullets={bullets} numbered />
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "timeline" || slide.layout === "diagram") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 78, position: "relative", zIndex: 3 }}>
          <DisplayTitle slide={slide} fallbackSize={74} />
          {slide.body ? <div style={{ display: "flex", marginTop: 26, maxWidth: 850 }}><BodyText slide={slide} fallbackSize={28}>{slide.body}</BodyText></div> : null}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 42, width: "92%" }}>
            {bullets.slice(0, 4).map((bullet, index) => (
              <div key={`${bullet}-${index}`} style={{ display: "flex", gap: 24, minHeight: 132 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 56 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 900, background: p.accent, color: p.foreground, fontSize: 19, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</div>
                  {index < bullets.length - 1 ? <div style={{ display: "flex", width: stroke, flex: 1, background: p.line }} /> : null}
                </div>
                <span style={{ fontFamily: typeface(slide, false), fontSize: bodySize(slide, 30), lineHeight: 1.3, paddingTop: 7 }}>{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "quote") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, position: "relative", zIndex: 3, maxWidth: 900 }}>
          <span style={{ fontFamily: FIGMA_TYPEFACE_CSS["canela-deck"], fontSize: 210, lineHeight: 0.55, color: p.accent }}>“</span>
          <DisplayTitle slide={slide} fallbackSize={82} />
          {slide.body ? <div style={{ display: "flex", marginTop: 42, maxWidth: 820 }}><BodyText slide={slide} fallbackSize={34}>{slide.body}</BodyText></div> : null}
        </div>
      </Shell>
    );
  }

  if (slide.layout === "calendar") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", gap: 44, marginTop: 86, position: "relative", zIndex: 3 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 470 }}><DisplayTitle slide={slide} fallbackSize={76} />{slide.body ? <div style={{ display: "flex", marginTop: 34 }}><BodyText slide={slide}>{slide.body}</BodyText></div> : null}</div>
          <div style={{ display: "flex", width: 420, height: 500, flexWrap: "wrap", gap: 10, alignContent: "flex-start", padding: 24, borderRadius: radius, background: withAlpha(p.foreground, 0.08), border: `${stroke}px solid ${p.line}` }}>
            {Array.from({ length: 35 }).map((_, index) => <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 8, background: index % 6 === 0 ? p.accent : withAlpha(p.foreground, 0.13), color: p.foreground, fontSize: 17, fontWeight: 700 }}>{index + 1 <= 31 ? index + 1 : ""}</div>)}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "product") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", gap: 42, alignItems: "center", flex: 1, position: "relative", zIndex: 3 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 500 }}><DisplayTitle slide={slide} fallbackSize={80} />{slide.body ? <div style={{ display: "flex", marginTop: 38 }}><BodyText slide={slide}>{slide.body}</BodyText></div> : null}</div>
          <div style={{ display: "flex", position: "relative", width: 390, height: 580, alignItems: "center", justifyContent: "center" }}><DecorativeElement element="product-mockup" slide={slide} index={3} /></div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "collage" || slide.layout === "photo") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative", zIndex: 3, paddingTop: 62 }}>
          <DisplayTitle slide={slide} fallbackSize={78} />
          {slide.body ? <div style={{ display: "flex", marginTop: 26, maxWidth: 760 }}><BodyText slide={slide}>{slide.body}</BodyText></div> : null}
          <div style={{ display: "flex", position: "relative", height: 520, marginTop: 24 }}>
            <div style={{ display: "flex", position: "absolute", width: 430, height: 440, left: 40, top: 30, borderRadius: radius, background: FIGMA_GRADIENTS["blue-periwinkle-linear"], transform: "rotate(-5deg)", border: `${stroke}px solid ${p.foreground}` }} />
            <div style={{ display: "flex", position: "absolute", width: 430, height: 440, right: 40, top: 0, borderRadius: radius, background: FIGMA_GRADIENTS["pink-blue-linear"], transform: "rotate(6deg)", border: `${stroke}px solid ${p.foreground}` }} />
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "sticker-sheet") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative", zIndex: 3, paddingTop: 62 }}>
          <DisplayTitle slide={slide} fallbackSize={78} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 50 }}>
            {(bullets.length ? bullets : ["IA", "Academy", "Future", "Build"]).slice(0, 4).map((item, index) => <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 430, height: 170, borderRadius: index % 2 ? 900 : radius, background: index % 2 ? p.accent : p.foreground, color: index % 2 ? p.foreground : p.backgroundColor, border: `${stroke}px solid ${p.accent}`, transform: `rotate(${index % 2 ? 4 : -4}deg)`, fontFamily: index % 2 ? FIGMA_TYPEFACE_CSS.figtree : FIGMA_TYPEFACE_CSS["canela-deck"], fontSize: 42, fontWeight: 800 }}>{item}</div>)}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cta") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, maxWidth: 900, position: "relative", zIndex: 3, paddingBottom: 30 }}>
          <span style={{ fontFamily: typeface(slide, false), fontSize: 25, textTransform: "uppercase", letterSpacing: 4, marginBottom: 34 }}>Continue a conversa</span>
          <DisplayTitle slide={slide} fallbackSize={102} />
          {slide.body ? <div style={{ display: "flex", marginTop: 48, maxWidth: 820 }}><BodyText slide={slide} fallbackSize={36}>{slide.body}</BodyText></div> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 66 }}><span style={{ display: "flex", height: 4, width: 110, background: p.foreground }} /><span style={{ fontFamily: typeface(slide, false), fontSize: 25, fontWeight: 800 }}>salve · compartilhe · acompanhe</span></div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cover") {
    const centered = slide.composition === "poster" || slide.composition === "centered";
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", justifyContent: "center", flex: 1, maxWidth: centered ? 940 : 900, position: "relative", zIndex: 3, paddingBottom: 24 }}>
          <span style={{ display: "flex", width: 96, height: 10, marginBottom: 42, background: p.accent }} />
          <DisplayTitle slide={slide} fallbackSize={108} centered={centered} />
          {slide.body ? <div style={{ display: "flex", marginTop: 48, maxWidth: 790, textAlign: centered ? "center" : "left" }}><BodyText slide={slide} fallbackSize={34}>{slide.body}</BodyText></div> : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell slide={slide} total={total}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, maxWidth: 900, position: "relative", zIndex: 3, paddingBottom: 20 }}>
        <span style={{ position: "absolute", right: -8, top: -100, fontFamily: FIGMA_TYPEFACE_CSS["canela-deck"], fontStyle: "italic", fontSize: 260, lineHeight: 1, color: withAlpha(p.foreground, 0.08) }}>{String(slide.position).padStart(2, "0")}</span>
        <DisplayTitle slide={slide} fallbackSize={86} />
        {slide.body ? <div style={{ display: "flex", marginTop: 42, maxWidth: 820 }}><BodyText slide={slide} fallbackSize={31}>{slide.body}</BodyText></div> : null}
        {bullets.length ? <div style={{ display: "flex", marginTop: 48, maxWidth: 850 }}><BulletList slide={slide} bullets={bullets} /></div> : null}
      </div>
    </Shell>
  );
}
