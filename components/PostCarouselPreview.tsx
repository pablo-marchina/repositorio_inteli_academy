"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type PreviewSlide = {
  position: number;
  url: string;
};

export function PostCarouselPreview({ title, slides }: { title: string; slides: PreviewSlide[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const current = slides[index];

  function previous() {
    setIndex((value) => (value - 1 + slides.length) % slides.length);
  }

  function next() {
    setIndex((value) => (value + 1) % slides.length);
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, slides.length]);

  if (!slides.length) return null;

  return (
    <>
      <button
        className="button secondary"
        type="button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
      >
        Visualizar carrossel
      </button>

      {open && current ? (
        <div
          className="carousel-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="carousel-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Prévia do carrossel: ${title}`}
          >
            <header className="carousel-modal-header">
              <div>
                <span className="eyebrow">Prévia completa</span>
                <h2>{title}</h2>
              </div>
              <button className="carousel-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Fechar prévia">
                ×
              </button>
            </header>

            <div className="carousel-stage">
              {slides.length > 1 ? (
                <button className="carousel-arrow previous" type="button" onClick={previous} aria-label="Slide anterior">
                  ‹
                </button>
              ) : null}

              <div className="carousel-image-frame">
                <Image
                  key={current.url}
                  src={current.url}
                  alt={`Slide ${index + 1} de ${slides.length}: ${title}`}
                  width={1080}
                  height={1350}
                  sizes="(max-width: 760px) 92vw, 62vw"
                  priority
                  unoptimized
                />
              </div>

              {slides.length > 1 ? (
                <button className="carousel-arrow next" type="button" onClick={next} aria-label="Próximo slide">
                  ›
                </button>
              ) : null}
            </div>

            <div className="carousel-toolbar">
              <strong>Slide {index + 1} de {slides.length}</strong>
              <span>Use as setas do teclado para navegar.</span>
              <a className="button secondary" href={current.url} target="_blank" rel="noreferrer">
                Abrir em tamanho original
              </a>
            </div>

            <div className="carousel-thumbnails" aria-label="Selecionar slide">
              {slides.map((slide, slideIndex) => (
                <button
                  className={`carousel-thumbnail${slideIndex === index ? " active" : ""}`}
                  type="button"
                  key={slide.position}
                  onClick={() => setIndex(slideIndex)}
                  aria-label={`Abrir slide ${slideIndex + 1}`}
                  aria-current={slideIndex === index ? "true" : undefined}
                >
                  <Image
                    src={slide.url}
                    alt=""
                    width={144}
                    height={180}
                    sizes="84px"
                    loading="lazy"
                    unoptimized
                  />
                  <span>{slideIndex + 1}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
