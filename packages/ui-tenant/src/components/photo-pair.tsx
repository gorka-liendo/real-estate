// Signature #4 — par de fotos editorial con caption debajo (nunca superpuesto).
export type Photo = { src?: string; alt?: string; caption: string };

function PhotoCard({ photo }: { photo: Photo }) {
  return (
    <figure style={{ margin: 0 }}>
      {photo.src ? (
        <img className="rt-photo__img" src={photo.src} alt={photo.alt ?? ""} />
      ) : (
        <div className="rt-photo__img" role="img" aria-label={photo.alt ?? photo.caption} />
      )}
      <figcaption className="rt-photo__cap">{photo.caption}</figcaption>
    </figure>
  );
}

export function PhotoPair({ photos }: { photos: [Photo, Photo] }) {
  return (
    <div className="rt-photopair">
      <PhotoCard photo={photos[0]} />
      <PhotoCard photo={photos[1]} />
    </div>
  );
}
