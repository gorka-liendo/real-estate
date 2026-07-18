"use client";

import { useCallback, useEffect, useState } from "react";

// Galería premium de la ficha: mosaico (1 principal + hasta 4 tiles) que abre
// un visor fullscreen con navegación. Los vídeos son slides más del visor
// (badge ▶ en su tile). En móvil el mosaico colapsa a carrusel scroll-snap
// (ver base.css). Estilo 100% con tokens --tenant-*.
export type GalleryItem = {
  type: "photo" | "video";
  url: string;
};

function PlayBadge() {
  return (
    <span className="rt-mosaic__play" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function Tile({
  item,
  alt,
  onOpen,
  className,
  overlay,
}: {
  item: GalleryItem;
  alt: string;
  onOpen: () => void;
  className: string;
  overlay?: string;
}) {
  return (
    <button type="button" className={className} onClick={onOpen} aria-label={alt}>
      {item.type === "photo" ? (
        <img className="rt-mosaic__img" src={item.url} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <video className="rt-mosaic__img" src={item.url} preload="metadata" muted playsInline />
      )}
      {item.type === "video" ? <PlayBadge /> : null}
      {overlay ? <span className="rt-mosaic__more">{overlay}</span> : null}
    </button>
  );
}

export function Gallery({ items, title }: { items: GalleryItem[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = items.length;

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpen((cur) => (cur === null ? cur : (cur + delta + count) % count)),
    [count],
  );

  // Teclado + bloqueo del scroll del body mientras el visor está abierto.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, step]);

  if (count === 0) {
    return (
      <div className="rt-mosaic rt-mosaic--empty">
        <div className="rt-mosaic__img rt-mosaic__img--placeholder" role="img" aria-label={title} />
      </div>
    );
  }

  // Mosaico: principal + hasta 4 secundarias; el último tile lleva "+N fotos"
  // si quedan más elementos. Con pocas fotos el grid se adapta (modificador).
  const tiles = items.slice(1, 5);
  const remaining = count - 1 - tiles.length;
  const variant = count === 1 ? "rt-mosaic--single" : tiles.length <= 2 ? "rt-mosaic--few" : "";
  const current = open !== null ? items[open]! : null;

  return (
    <>
      <div className={`rt-mosaic ${variant}`.trim()}>
        <Tile
          item={items[0]!}
          alt={`${title} — foto principal`}
          onOpen={() => setOpen(0)}
          className="rt-mosaic__cell rt-mosaic__cell--main"
        />
        {tiles.map((item, i) => (
          <Tile
            key={item.url}
            item={item}
            alt={`${title} — ${item.type === "video" ? "vídeo" : "foto"} ${i + 2}`}
            onOpen={() => setOpen(i + 1)}
            className="rt-mosaic__cell"
            overlay={i === tiles.length - 1 && remaining > 0 ? `+${remaining} fotos` : undefined}
          />
        ))}
        {count > 1 ? (
          <button type="button" className="rt-mosaic__all" onClick={() => setOpen(0)}>
            Ver las {count} fotos
          </button>
        ) : null}
      </div>

      {current ? (
        <div
          className="rt-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Galería de ${title}`}
          onClick={close}
        >
          <div className="rt-lightbox__bar">
            <span className="rt-lightbox__count">
              {open! + 1} / {count}
            </span>
            <button
              type="button"
              className="rt-lightbox__btn"
              onClick={close}
              aria-label="Cerrar galería"
            >
              ✕
            </button>
          </div>

          <div className="rt-lightbox__stage" onClick={(e) => e.stopPropagation()}>
            {current.type === "photo" ? (
              <img className="rt-lightbox__media" src={current.url} alt={title} />
            ) : (
              // key fuerza remontar el <video> al cambiar de slide (corta la reproducción)
              <video key={current.url} className="rt-lightbox__media" src={current.url} controls autoPlay playsInline />
            )}
          </div>

          {count > 1 ? (
            <>
              <button
                type="button"
                className="rt-lightbox__btn rt-lightbox__nav rt-lightbox__nav--prev"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Anterior"
              >
                ‹
              </button>
              <button
                type="button"
                className="rt-lightbox__btn rt-lightbox__nav rt-lightbox__nav--next"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Siguiente"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
