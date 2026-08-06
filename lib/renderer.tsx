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
  fontFamily: "Arial, sans-serif"
};

function Mark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 94,
        height: 94,
        borderRadius: 24,
        background: inverse ? brand.colors.white : brand.colors.blue,
        color: inverse ? brand.colors.blue : brand.colors.white,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: 42,
        letterSpacing: -5
      }}
    >
      IA
    </div>
  );
}

function Footer({ index, total, inverse = false }: { index: number; total: number; inverse?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 50,
        justifyContent: "space-between",
        alignItems: "center",
        color: inverse ? brand.colors.white : brand.colors.black,
        fontSize: 26
      }}
    >
      <span>Inteli Academy</span>
      <span>{String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
    </div>
  );
}

function Decoration({ inverse = false }: { inverse?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 620,
        height: 620,
        right: -180,
        top: 170,
        border: `8px solid ${inverse ? "rgba(255,255,255,.28)" : "rgba(42,0,255,.18)"}`,
        transform: "rotate(18deg)",
        display: "flex"
      }}
    />
  );
}

export function renderSlide(slide: PostSlide, total: number) {
  const inverse = slide.accent === "blue" || (slide.layout === "cover" && slide.accent !== "white");
  const background = inverse ? brand.colors.blue : slide.accent === "black" ? brand.colors.black : brand.colors.soft;
  const foreground = inverse || slide.accent === "black" ? brand.colors.white : brand.colors.black;
  const muted = inverse || slide.accent === "black" ? "rgba(255,255,255,.78)" : brand.colors.gray;

  if (slide.layout === "sources") {
    return (
      <div style={{ ...base, background, color: foreground, padding: "80px 70px 130px" }}>
        <Decoration inverse={inverse} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 28, textTransform: "uppercase", letterSpacing: 4 }}>Fontes verificadas</span>
          <Mark inverse={inverse} />
        </div>
        <h1 style={{ fontSize: 92, lineHeight: 1, margin: "92px 0 50px", letterSpacing: -4 }}>{slide.title}</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "88%" }}>
          {(slide.sourceLabels ?? slide.bullets ?? []).slice(0, 8).map((source, index) => (
            <div key={source} style={{ display: "flex", gap: 24, fontSize: 31, alignItems: "center" }}>
              <span style={{ color: inverse ? brand.colors.white : brand.colors.blue, fontWeight: 800 }}>{index + 1}</span>
              <span>{source}</span>
            </div>
          ))}
        </div>
        <Footer index={slide.position} total={total} inverse={inverse || slide.accent === "black"} />
      </div>
    );
  }

  if (slide.layout === "stat") {
    return (
      <div style={{ ...base, background, color: foreground, padding: "80px 70px 130px" }}>
        <Decoration inverse={inverse} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 28, textTransform: "uppercase", letterSpacing: 4 }}>{slide.eyebrow ?? "Em números"}</span>
          <Mark inverse={inverse} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 120, maxWidth: 900 }}>
          <span style={{ fontSize: 220, lineHeight: 0.85, fontWeight: 800, letterSpacing: -12 }}>{slide.stat ?? "IA"}</span>
          <span style={{ fontSize: 44, lineHeight: 1.15, marginTop: 42, color: muted }}>{slide.statLabel ?? slide.title}</span>
          {slide.body ? <span style={{ fontSize: 31, lineHeight: 1.35, marginTop: 42 }}>{slide.body}</span> : null}
        </div>
        <Footer index={slide.position} total={total} inverse={inverse || slide.accent === "black"} />
      </div>
    );
  }

  if (slide.layout === "cards" || slide.layout === "split") {
    const items = slide.bullets?.slice(0, 4) ?? [];
    return (
      <div style={{ ...base, background, color: foreground, padding: "80px 70px 130px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 28, textTransform: "uppercase", letterSpacing: 4 }}>{slide.eyebrow ?? "O que aconteceu"}</span>
          <Mark inverse={inverse} />
        </div>
        <h1 style={{ fontSize: 82, lineHeight: 1.03, margin: "80px 0 55px", maxWidth: 940, letterSpacing: -3 }}>{slide.title}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
          {items.map((item, index) => (
            <div
              key={item}
              style={{
                display: "flex",
                flexDirection: "column",
                width: items.length > 2 ? 450 : 940,
                minHeight: 170,
                padding: "30px 34px",
                borderRadius: 28,
                background: inverse ? "rgba(255,255,255,.14)" : brand.colors.white,
                border: `2px solid ${inverse ? "rgba(255,255,255,.2)" : "rgba(39,39,39,.08)"}`,
                fontSize: 31,
                lineHeight: 1.25
              }}
            >
              <span style={{ fontSize: 23, color: inverse ? brand.colors.white : brand.colors.blue, fontWeight: 800, marginBottom: 16 }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <Footer index={slide.position} total={total} inverse={inverse || slide.accent === "black"} />
      </div>
    );
  }

  if (slide.layout === "cta") {
    return (
      <div style={{ ...base, background: brand.colors.blue, color: brand.colors.white, padding: "80px 70px 130px" }}>
        <Decoration inverse />
        <Mark inverse />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 180, maxWidth: 930 }}>
          <span style={{ fontSize: 30, textTransform: "uppercase", letterSpacing: 4 }}>{slide.eyebrow ?? "Sua vez"}</span>
          <h1 style={{ fontSize: 102, lineHeight: 0.98, letterSpacing: -5, margin: "36px 0" }}>{slide.title}</h1>
          <p style={{ fontSize: 38, lineHeight: 1.3, margin: 0, color: "rgba(255,255,255,.82)" }}>{slide.body}</p>
        </div>
        <Footer index={slide.position} total={total} inverse />
      </div>
    );
  }

  return (
    <div style={{ ...base, background, color: foreground, padding: "80px 70px 130px" }}>
      <Decoration inverse={inverse} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 28, textTransform: "uppercase", letterSpacing: 4 }}>{slide.eyebrow ?? "IA nesta semana"}</span>
        <Mark inverse={inverse} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: slide.layout === "cover" ? 180 : 120, maxWidth: 930 }}>
        <h1
          style={{
            fontFamily: slide.layout === "cover" ? "Georgia, serif" : "Arial, sans-serif",
            fontSize: slide.layout === "cover" ? 112 : 88,
            lineHeight: 0.98,
            letterSpacing: slide.layout === "cover" ? -5 : -3,
            margin: 0
          }}
        >
          {slide.title}
        </h1>
        {slide.body ? <p style={{ fontSize: 38, lineHeight: 1.32, margin: "55px 0 0", color: muted }}>{slide.body}</p> : null}
        {slide.bullets?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 48 }}>
            {slide.bullets.slice(0, 4).map((bullet) => (
              <div key={bullet} style={{ display: "flex", gap: 18, fontSize: 31, lineHeight: 1.25 }}>
                <span style={{ color: inverse ? brand.colors.white : brand.colors.blue }}>→</span>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Footer index={slide.position} total={total} inverse={inverse || slide.accent === "black"} />
    </div>
  );
}
