import { useEffect, useState } from "react";
import { ExternalLink } from "@/lib/icons";
import { SITE_URL } from "@/lib/site";
import { imageSource } from "./image-source";
export function ImagePreview({
  value,
  alt = "",
  storage = false,
  compact = false,
}: {
  value: string;
  alt?: string;
  storage?: boolean;
  compact?: boolean;
}) {
  const [debounced, setDebounced] = useState(value),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 350);
    return () => clearTimeout(timer);
  }, [value]);
  const src = imageSource(
    debounced,
    SITE_URL,
    storage
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/`
      : undefined,
  );
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);
  if (!value.trim()) return null;
  return (
    <figure className={`image-preview ${compact ? "compact" : ""} ${loaded ? "is-loaded" : ""}`}>
      {src && !failed ? (
        <>
          <div className="image-preview-frame">
            <img
              key={src}
              src={src}
              alt={alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
            {!loaded && <span>Loading preview…</span>}
          </div>
          <figcaption>
            <span>{new URL(src).hostname}</span>
            <a href={src} target="_blank" rel="noreferrer">
              Open original <ExternalLink />
            </a>
          </figcaption>
        </>
      ) : (
        <div className="image-preview-error" role="status">
          {src
            ? "This image could not load. Check the URL and whether its host allows image embedding."
            : "Enter a valid HTTP or HTTPS image URL."}
          <small>Use a direct link to the image, not a sharing or gallery page.</small>
        </div>
      )}
    </figure>
  );
}
