import React from "react";
import { brand } from "@/lib/brand";
import { FIGMA_TYPEFACE_CSS } from "@/lib/figma-visual-system";
import type { PostSlide } from "@/lib/types";

/**
 * Instagram renderer calibrated against the historical Inteli Academy Social Media
 * frames in the ID Academy Figma file. It intentionally ignores arbitrary visual
 * token combinations produced by the model. The model owns editorial content;
 * this renderer owns the visual grammar.
 *
 * Historical references audited in Figma include:
 * - Workshop Tractian (769:8)
 * - Happy Hour Segura (813:232)
 * - Workshop Rivio (393:101)
 * - BTG case carousel (1205:136)
 * - Inteli Academy x Estimulo carousel (1019:2)
 */

const BLUE = "#2A00FF";
const BLACK = "#000000";
const INK = "#272727";
const WHITE = "#FFFFFF";
const SOFT = "#F8F8F8";
const LAVENDER = "#D0C7FF";
const LINE = "#E6E6EC";

const sans = FIGMA_TYPEFACE_CSS.figtree;
const display = FIGMA_TYPEFACE_CSS["canela-deck"];

const root: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "hidden",
  fontFamily: sans
};

function IaMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 62,
        left: 0,
        right: 0,
        justifyContent: "center",
        color: inverse ? WHITE : BLUE,
        fontFamily: sans,
        fontSize: 51,
        lineHeight: 1,
        fontWeight: 900,
        fontStyle: "italic",
        letterSpacing: -6,
        zIndex: 8
      }}
    >
      IA
    </div>
  );
}

function BottomRule() {
  return <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: BLUE, zIndex: 10 }} />;
}

function SoftBackdrop({ dark = false }: { dark?: boolean }) {
  if (dark) return null;
  return (
    <div style={{ display: "flex", position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          width: 840,
          height: 840,
          borderRadius: 900,
          background: LAVENDER,
          opacity: 0.22,
          left: -500,
          top: -460
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: 900,
          background: LAVENDER,
          opacity: 0.18,
          right: -520,
          bottom: -430
        }}
      />
    </div>
  );
}

function GhostFooter({ text = "AI  WEEKLY" }: { text?: string }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: -42,
        right: -42,
        bottom: 52,
        justifyContent: "space-between",
        alignItems: "center",
        color: LAVENDER,
        opacity: 0.25,
        fontFamily: display,
        fontSize: 75,
        fontStyle: "italic",
        whiteSpace: "nowrap"
      }}
    >
      <span>{text}</span>
      <span style={{ fontSize: 92 }}>✦</span>
      <span>{text}</span>
    </div>
  );
}

function Scribble() {
  return (
    <div style={{ display: "flex", position: "relative", width: 570, height: 56, marginTop: 16 }}>
      <div style={{ display: "flex", position: "absolute", left: 60, top: 8, width: 410, height: 6, borderRadius: 20, background: BLUE, transform: "rotate(-2deg)" }} />
      <div style={{ display: "flex", position: "absolute", left: 18, top: 28, width: 530, height: 6, borderRadius: 20, background: BLUE, transform: "rotate(2deg)" }} />
      <div style={{ display: "flex", position: "absolute", left: 105, top: 39, width: 360, height: 4, borderRadius: 20, background: BLUE, opacity: 0.8, transform: "rotate(-1deg)" }} />
    </div>
  );
}

function CornerMarks() {
  const size = 34;
  const weight = 5;
  const shared: React.CSSProperties = { display: "flex", position: "absolute", width: size, height: size };
  return (
    <div style={{ display: "flex", position: "absolute", left: 74, right: 74, top: 330, height: 330 }}>
      <div style={{ ...shared, left: 0, top: 0, borderTop: `${weight}px solid ${BLUE}`, borderLeft: `${weight}px solid ${BLUE}` }} />
      <div style={{ ...shared, right: 0, top: 0, borderTop: `${weight}px solid ${BLUE}`, borderRight: `${weight}px solid ${BLUE}` }} />
      <div style={{ ...shared, left: 0, bottom: 0, borderBottom: `${weight}px solid ${BLUE}`, borderLeft: `${weight}px solid ${BLUE}` }} />
      <div style={{ ...shared, right: 0, bottom: 0, borderBottom: `${weight}px solid ${BLUE}`, borderRight: `${weight}px solid ${BLUE}` }} />
    </div>
  );
}

function Cover({ slide }: { slide: PostSlide }) {
  return (
    <div style={{ ...root, background: SOFT, color: INK }}>
      <SoftBackdrop />
      <IaMark />
      <CornerMarks />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 84,
          right: 84,
          top: 350,
          alignItems: "center",
          textAlign: "center",
          zIndex: 4
        }}
      >
        <div style={{ display: "flex", color: BLUE, fontFamily: display, fontSize: 58, lineHeight: 1, fontWeight: 400 }}>
          {slide.eyebrow ?? "AI Weekly"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 8,
            maxWidth: 900,
            color: BLUE,
            fontFamily: display,
            fontSize: slide.title.length > 54 ? 70 : slide.title.length > 36 ? 78 : 90,
            lineHeight: 0.98,
            letterSpacing: -3.5,
            fontWeight: 700
          }}
        >
          {slide.title}
        </div>
        <Scribble />
        {slide.body ? (
          <div style={{ display: "flex", maxWidth: 760, marginTop: 22, color: INK, fontSize: 28, lineHeight: 1.3, fontWeight: 400 }}>
            {slide.body}
          </div>
        ) : null}
      </div>
      <GhostFooter />
      <BottomRule />
    </div>
  );
}

function ContentHeader({ slide, position, total }: { slide: PostSlide; position: number; total: number }) {
  return (
    <div style={{ display: "flex", position: "absolute", left: 72, right: 72, top: 66, justifyContent: "space-between", alignItems: "center", zIndex: 8 }}>
      <span style={{ color: BLUE, fontFamily: sans, fontWeight: 900, fontStyle: "italic", fontSize: 42, letterSpacing: -5 }}>IA</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14, color: INK, fontSize: 18, fontWeight: 600 }}>
        <span>{String(position).padStart(2, "0")}</span>
        <span style={{ display: "flex", width: 54, height: 2, background: BLUE }} />
        <span>{String(total).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

function NumberedBullets({ bullets }: { bullets: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 28 }}>
      {bullets.slice(0, 4).map((bullet, index) => (
        <div
          key={`${index}-${bullet}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 22,
            minHeight: 104,
            padding: "22px 0",
            borderTop: `2px solid ${LINE}`
          }}
        >
          <span style={{ display: "flex", width: 70, flexShrink: 0, color: BLUE, fontFamily: display, fontSize: 44, lineHeight: 1, fontWeight: 700 }}>
            {String(index + 1).padStart(2, "0")}.
          </span>
          <span style={{ color: INK, fontSize: 30, lineHeight: 1.25, fontWeight: 500 }}>{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function EditorialContent({ slide, total }: { slide: PostSlide; total: number }) {
  const bullets = slide.bullets ?? [];
  return (
    <div style={{ ...root, background: WHITE, color: INK }}>
      <SoftBackdrop />
      <ContentHeader slide={slide} position={slide.position} total={total} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 88, right: 88, top: 190, bottom: 120, zIndex: 4 }}>
        <div style={{ display: "flex", color: BLUE, fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: 3.2 }}>
          {slide.eyebrow ?? "Inteligência artificial"}
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 900,
            marginTop: 18,
            color: BLUE,
            fontFamily: display,
            fontSize: slide.title.length > 60 ? 64 : slide.title.length > 40 ? 72 : 82,
            lineHeight: 0.98,
            letterSpacing: -2.5,
            fontWeight: 700
          }}
        >
          {slide.title}
        </div>
        {slide.body ? (
          <div style={{ display: "flex", maxWidth: 850, marginTop: 34, color: INK, fontSize: slide.body.length > 190 ? 28 : 31, lineHeight: 1.34, fontWeight: 400 }}>
            {slide.body}
          </div>
        ) : null}
        {bullets.length ? <NumberedBullets bullets={bullets} /> : null}
      </div>
      <GhostFooter text="INTELI  ACADEMY" />
      <BottomRule />
    </div>
  );
}

function StatSlide({ slide, total }: { slide: PostSlide; total: number }) {
  return (
    <div style={{ ...root, background: WHITE, color: INK }}>
      <SoftBackdrop />
      <ContentHeader slide={slide} position={slide.position} total={total} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 92, right: 92, top: 230, zIndex: 4 }}>
        <div style={{ display: "flex", color: BLUE, fontFamily: display, fontSize: 190, lineHeight: 0.8, letterSpacing: -8, fontWeight: 700 }}>
          {slide.stat ?? "IA"}
        </div>
        <div style={{ display: "flex", width: 360, height: 7, marginTop: 54, borderRadius: 20, background: BLUE }} />
        <div style={{ display: "flex", maxWidth: 860, marginTop: 36, color: INK, fontFamily: display, fontSize: 60, lineHeight: 1.02, fontWeight: 700 }}>
          {slide.statLabel ?? slide.title}
        </div>
        {slide.body ? <div style={{ display: "flex", maxWidth: 800, marginTop: 32, color: INK, fontSize: 30, lineHeight: 1.35 }}>{slide.body}</div> : null}
      </div>
      <GhostFooter />
      <BottomRule />
    </div>
  );
}

function QuoteSlide({ slide, total }: { slide: PostSlide; total: number }) {
  return (
    <div style={{ ...root, background: SOFT, color: INK }}>
      <SoftBackdrop />
      <ContentHeader slide={slide} position={slide.position} total={total} />
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 90, right: 90, top: 265, zIndex: 4 }}>
        <span style={{ color: BLUE, fontFamily: display, fontSize: 120, lineHeight: 0.5 }}>“</span>
        <div style={{ display: "flex", maxWidth: 880, color: BLUE, fontFamily: display, fontSize: slide.title.length > 60 ? 61 : 72, lineHeight: 1.04, fontWeight: 600 }}>
          {slide.title}
        </div>
        {slide.body ? <div style={{ display: "flex", maxWidth: 800, marginTop: 38, color: INK, fontSize: 29, lineHeight: 1.35 }}>{slide.body}</div> : null}
      </div>
      <GhostFooter text="INTELI  ACADEMY" />
      <BottomRule />
    </div>
  );
}

function Cta({ slide }: { slide: PostSlide }) {
  return (
    <div style={{ ...root, background: BLACK, color: WHITE }}>
      <IaMark inverse />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 82,
          right: 82,
          top: 410,
          alignItems: "center",
          textAlign: "center"
        }}
      >
        <div style={{ display: "flex", maxWidth: 900, color: WHITE, fontFamily: sans, fontSize: slide.title.length > 70 ? 50 : 58, lineHeight: 1.15, fontWeight: 500 }}>
          {slide.title}
        </div>
        {slide.body ? <div style={{ display: "flex", maxWidth: 760, marginTop: 34, color: WHITE, opacity: 0.78, fontSize: 28, lineHeight: 1.32 }}>{slide.body}</div> : null}
        <div style={{ display: "flex", width: 170, height: 7, marginTop: 48, borderRadius: 20, background: BLUE }} />
      </div>
      <BottomRule />
    </div>
  );
}

export function renderInstagramHistoricalSlide(slide: PostSlide, total: number) {
  if (slide.layout === "cover") return <Cover slide={slide} />;
  if (slide.layout === "cta") return <Cta slide={slide} />;
  if (slide.layout === "stat") return <StatSlide slide={slide} total={total} />;
  if (slide.layout === "quote") return <QuoteSlide slide={slide} total={total} />;
  return <EditorialContent slide={slide} total={total} />;
}

export const INSTAGRAM_HISTORICAL_STYLE = {
  version: "instagram-historical-v1",
  references: ["769:8", "813:232", "393:101", "1205:136", "1019:2"],
  principles: [
    "1080x1350 feed format",
    "small centered IA wordmark",
    "white/off-white canvas with restrained lavender atmosphere",
    "institutional blue as the dominant accent",
    "Canela-like editorial display paired with Figtree-like sans",
    "large whitespace and low visual density",
    "hand-drawn underline/corner details only on covers",
    "black closing slide with centered white CTA",
    "no arbitrary product, robot, glass, shader or sticker motifs"
  ],
  colors: { blue: BLUE, black: BLACK, ink: INK, white: WHITE, soft: SOFT, lavender: LAVENDER, line: LINE },
  brand: brand.name
} as const;
