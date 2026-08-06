import React from "react";
import { brand } from "@/lib/brand";
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

function colors(slide: PostSlide) {
  const accent = slide.accent ?? (slide.layout === "cover" || slide.layout === "cta" ? "blue" : "white");
  const dark = accent === "blue" || accent === "black";
  return {
    accent,
    dark,
    background: accent === "blue" ? brand.colors.blue : accent === "black" ? brand.colors.black : brand.colors.soft,
    foreground: dark ? brand.colors.white : brand.colors.black,
    muted: dark ? "rgba(255,255,255,.76)" : brand.colors.gray,
    line: dark ? "rgba(255,255,255,.24)" : brand.colors.line
  };
}

function Mark({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
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
        background: dark ? brand.colors.white : brand.colors.blue,
        color: dark ? brand.colors.blue : brand.colors.white,
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

function Motif({ slide, dark }: { slide: PostSlide; dark: boolean }) {
  const motif = slide.motif ?? "frame";
  const color = dark ? "rgba(255,255,255,.22)" : "rgba(42,0,255,.18)";

  if (motif === "orbit") {
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0 }}>
        <div style={{ display: "flex", position: "absolute", width: 620, height: 620, borderRadius: 999, border: `5px solid ${color}`, right: -170, top: 190 }} />
        <div style={{ display: "flex", position: "absolute", width: 360, height: 360, borderRadius: 999, border: `2px solid ${color}`, right: -30, top: 320 }} />
        <div style={{ display: "flex", position: "absolute", width: 34, height: 34, borderRadius: 999, background: dark ? brand.colors.white : brand.colors.blue, right: 206, top: 305 }} />
      </div>
    );
  }

  if (motif === "grid") {
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0, opacity: 0.55 }}>
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={`v-${index}`} style={{ display: "flex", position: "absolute", width: 1, height: 1120, background: color, left: 70 + index * 156, top: 88 }} />
        ))}
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={`h-${index}`} style={{ display: "flex", position: "absolute", height: 1, width: 940, background: color, left: 70, top: 108 + index * 164 }} />
        ))}
      </div>
    );
  }

  if (motif === "ribbon") {
    return (
      <div
        style={{
          display: "flex",
          position: "absolute",
          width: 760,
          height: 170,
          background: dark ? "rgba(255,255,255,.12)" : brand.colors.blue,
          right: -250,
          top: 280,
          transform: "rotate(-23deg)"
        }}
      />
    );
  }

  if (motif === "brackets") {
    const bracket: React.CSSProperties = { display: "flex", position: "absolute", width: 100, height: 100, borderColor: color };
    return (
      <div style={{ display: "flex", position: "absolute", inset: 0 }}>
        <div style={{ ...bracket, left: 42, top: 42, borderLeft: `5px solid ${color}`, borderTop: `5px solid ${color}` }} />
        <div style={{ ...bracket, right: 42, top: 42, borderRight: `5px solid ${color}`, borderTop: `5px solid ${color}` }} />
        <div style={{ ...bracket, left: 42, bottom: 42, borderLeft: `5px solid ${color}`, borderBottom: `5px solid ${color}` }} />
        <div style={{ ...bracket, right: 42, bottom: 42, borderRight: `5px solid ${color}`, borderBottom: `5px solid ${color}` }} />
      </div>
    );
  }

  if (motif === "frame") {
    return <div style={{ display: "flex", position: "absolute", inset: 38, border: `3px solid ${color}`, borderRadius: 34 }} />;
  }

  return null;
}

function Header({ slide, dark }: { slide: PostSlide; dark: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Mark dark={dark} compact />
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.3 }}>Inteli Academy</span>
      </div>
      <span style={{ fontSize: 21, textTransform: "uppercase", letterSpacing: 3.2, opacity: 0.8 }}>{slide.eyebrow ?? "Inteligência artificial"}</span>
    </div>
  );
}

function Footer({ index, total, dark }: { index: number; total: number; dark: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 48,
        justifyContent: "space-between",
        alignItems: "center",
        color: dark ? brand.colors.white : brand.colors.black,
        fontSize: 23,
        zIndex: 3
      }}
    >
      <span style={{ fontWeight: 700 }}>AI Weekly</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", width: 92, height: 2, background: dark ? "rgba(255,255,255,.42)" : brand.colors.black }} />
        <span>{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
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

function DisplayTitle({
  slide,
  size,
  dark,
  centered = false
}: {
  slide: PostSlide;
  size: number;
  dark: boolean;
  centered?: boolean;
}) {
  const style = slide.titleStyle ?? (slide.layout === "cover" ? "mixed" : "sans");
  const segments = titleSegments(slide.title, slide.highlight);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        justifyContent: centered ? "center" : "flex-start",
        width: "100%",
        fontSize: size,
        lineHeight: 0.94,
        letterSpacing: -4.5,
        fontWeight: style === "serif" ? 500 : 850,
        fontFamily: style === "serif" ? brand.typography.display : brand.typography.sans,
        textAlign: centered ? "center" : "left"
      }}
    >
      {segments.map((part, index) => (
        <span
          key={`${part.text}-${index}`}
          style={{
            fontFamily: style === "mixed" && part.highlighted ? brand.typography.display : undefined,
            fontStyle: style === "mixed" && part.highlighted ? "italic" : undefined,
            color: part.highlighted ? (dark ? brand.colors.white : brand.colors.blue) : undefined,
            marginRight: index < segments.length - 1 ? 14 : 0
          }}
        >
          {part.text}
        </span>
      ))}
    </div>
  );
}

function BulletList({ bullets, dark, numbered = false }: { bullets: string[]; dark: boolean; numbered?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {bullets.slice(0, 4).map((bullet, index) => (
        <div key={`${bullet}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 18, fontSize: 30, lineHeight: 1.28 }}>
          <span
            style={{
              display: "flex",
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              width: numbered ? 48 : 18,
              height: numbered ? 48 : 18,
              marginTop: numbered ? -5 : 10,
              borderRadius: 999,
              background: dark ? brand.colors.white : brand.colors.blue,
              color: dark ? brand.colors.blue : brand.colors.white,
              fontSize: numbered ? 19 : 1,
              fontWeight: 900
            }}
          >
            {numbered ? String(index + 1).padStart(2, "0") : ""}
          </span>
          <span>{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function Shell({ slide, total, children }: { slide: PostSlide; total: number; children: React.ReactNode }) {
  const palette = colors(slide);
  return (
    <div style={{ ...base, background: palette.background, color: palette.foreground, padding: "64px 70px 126px" }}>
      <Motif slide={slide} dark={palette.dark} />
      <Header slide={slide} dark={palette.dark} />
      {children}
      <Footer index={slide.position} total={total} dark={palette.dark} />
    </div>
  );
}

export function renderSlide(slide: PostSlide, total: number) {
  const palette = colors(slide);
  const bullets = slide.bullets ?? [];

  if (slide.layout === "sources") {
    const sources = (slide.sourceLabels ?? slide.bullets ?? []).slice(0, 8);
    return (
      <Shell slide={{ ...slide, accent: slide.accent ?? "white", motif: slide.motif ?? "frame" }} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 80, position: "relative", zIndex: 2 }}>
          <DisplayTitle slide={slide} size={80} dark={palette.dark} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 52, width: "92%" }}>
            {sources.map((source, index) => (
              <div key={`${source}-${index}`} style={{ display: "flex", alignItems: "center", gap: 22, minHeight: 72, borderTop: `2px solid ${palette.line}` }}>
                <span style={{ width: 54, color: palette.dark ? brand.colors.white : brand.colors.blue, fontWeight: 900, fontSize: 24 }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 28, lineHeight: 1.2 }}>{source}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "stat") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 116, maxWidth: 900, position: "relative", zIndex: 2 }}>
          <span style={{ fontFamily: brand.typography.display, fontSize: 224, lineHeight: 0.78, fontWeight: 500, fontStyle: "italic", letterSpacing: -12 }}>
            {slide.stat ?? "IA"}
          </span>
          <span style={{ display: "flex", width: 210, height: 10, marginTop: 54, background: palette.dark ? brand.colors.white : brand.colors.blue }} />
          <span style={{ fontSize: 44, lineHeight: 1.08, marginTop: 34, fontWeight: 800 }}>{slide.statLabel ?? slide.title}</span>
          {slide.body ? <span style={{ fontSize: 29, lineHeight: 1.35, marginTop: 34, color: palette.muted, maxWidth: 780 }}>{slide.body}</span> : null}
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cards") {
    const items = bullets.slice(0, 4);
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 72, position: "relative", zIndex: 2 }}>
          <DisplayTitle slide={slide} size={76} dark={palette.dark} />
          {slide.body ? <p style={{ fontSize: 28, lineHeight: 1.32, margin: "28px 0 0", color: palette.muted, maxWidth: 850 }}>{slide.body}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 44 }}>
            {items.map((item, index) => (
              <div
                key={`${item}-${index}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: items.length > 2 ? 459 : 936,
                  minHeight: items.length > 2 ? 185 : 138,
                  padding: "28px 30px",
                  borderRadius: 30,
                  background: palette.dark ? "rgba(255,255,255,.13)" : brand.colors.white,
                  border: `2px solid ${palette.line}`
                }}
              >
                <span style={{ fontFamily: brand.typography.display, fontStyle: "italic", fontSize: 34, color: palette.dark ? brand.colors.white : brand.colors.blue }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 28, lineHeight: 1.24, marginTop: 13 }}>{item}</span>
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
        <div style={{ display: "flex", gap: 38, marginTop: 92, position: "relative", zIndex: 2, minHeight: 830 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 510 }}>
            <DisplayTitle slide={slide} size={78} dark={palette.dark} />
            {slide.body ? <p style={{ fontSize: 29, lineHeight: 1.34, color: palette.muted, margin: "38px 0 0" }}>{slide.body}</p> : null}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: 390,
              padding: "42px 34px",
              borderRadius: 38,
              background: palette.dark ? brand.colors.white : brand.colors.blue,
              color: palette.dark ? brand.colors.blue : brand.colors.white
            }}
          >
            <BulletList bullets={bullets} dark={!palette.dark} numbered />
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "timeline") {
    return (
      <Shell slide={slide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 78, position: "relative", zIndex: 2 }}>
          <DisplayTitle slide={slide} size={74} dark={palette.dark} />
          {slide.body ? <p style={{ fontSize: 28, lineHeight: 1.3, color: palette.muted, margin: "26px 0 0", maxWidth: 850 }}>{slide.body}</p> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 42, width: "92%" }}>
            {bullets.slice(0, 4).map((bullet, index) => (
              <div key={`${bullet}-${index}`} style={{ display: "flex", gap: 24, minHeight: 132 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 56 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 999, background: palette.dark ? brand.colors.white : brand.colors.blue, color: palette.dark ? brand.colors.blue : brand.colors.white, fontSize: 19, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</div>
                  {index < bullets.length - 1 ? <div style={{ display: "flex", width: 3, flex: 1, background: palette.line }} /> : null}
                </div>
                <span style={{ fontSize: 30, lineHeight: 1.3, paddingTop: 7 }}>{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cta") {
    const ctaSlide: PostSlide = { ...slide, accent: "blue", motif: slide.motif ?? "orbit", titleStyle: slide.titleStyle ?? "mixed" };
    return (
      <Shell slide={ctaSlide} total={total}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, maxWidth: 900, position: "relative", zIndex: 2, paddingBottom: 30 }}>
          <span style={{ fontSize: 25, textTransform: "uppercase", letterSpacing: 4, marginBottom: 34 }}>Continue a conversa</span>
          <DisplayTitle slide={ctaSlide} size={102} dark />
          {slide.body ? <p style={{ fontSize: 36, lineHeight: 1.28, margin: "48px 0 0", color: "rgba(255,255,255,.8)", maxWidth: 820 }}>{slide.body}</p> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 66 }}>
            <span style={{ display: "flex", height: 4, width: 110, background: brand.colors.white }} />
            <span style={{ fontSize: 25, fontWeight: 800 }}>salve · compartilhe · acompanhe</span>
          </div>
        </div>
      </Shell>
    );
  }

  if (slide.layout === "cover") {
    const centered = slide.composition === "poster";
    return (
      <Shell slide={slide} total={total}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: centered ? "center" : "flex-start",
            justifyContent: "center",
            flex: 1,
            maxWidth: centered ? 940 : 900,
            position: "relative",
            zIndex: 2,
            paddingBottom: 24
          }}
        >
          <span style={{ display: "flex", width: 96, height: 10, marginBottom: 42, background: palette.dark ? brand.colors.white : brand.colors.blue }} />
          <DisplayTitle slide={slide} size={108} dark={palette.dark} centered={centered} />
          {slide.body ? <p style={{ fontSize: 34, lineHeight: 1.28, margin: "48px 0 0", color: palette.muted, maxWidth: 790, textAlign: centered ? "center" : "left" }}>{slide.body}</p> : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell slide={slide} total={total}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, maxWidth: 900, position: "relative", zIndex: 2, paddingBottom: 20 }}>
        <span style={{ position: "absolute", right: -8, top: -100, fontFamily: brand.typography.display, fontStyle: "italic", fontSize: 260, lineHeight: 1, color: palette.dark ? "rgba(255,255,255,.08)" : "rgba(42,0,255,.08)" }}>{String(slide.position).padStart(2, "0")}</span>
        <DisplayTitle slide={slide} size={86} dark={palette.dark} />
        {slide.body ? <p style={{ fontSize: 31, lineHeight: 1.35, margin: "42px 0 0", color: palette.muted, maxWidth: 820 }}>{slide.body}</p> : null}
        {bullets.length ? <div style={{ display: "flex", marginTop: 48, maxWidth: 850 }}><BulletList bullets={bullets} dark={palette.dark} /></div> : null}
      </div>
    </Shell>
  );
}
