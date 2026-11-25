import { useState } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  title?: string;
}

export function SafeImage({ src, alt, className = '', title }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--line)] p-6 text-center ${className}`}
      >
        <span className="font-display text-2xl tracking-[0.18em] text-[var(--accent)]">RAW</span>
        {title && <span className="mt-2 text-xs text-[var(--soft)] max-w-[16ch] truncate">{title}</span>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
