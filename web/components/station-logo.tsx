type Props = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

/** Served from web/public/logo.jpg */
export function StationLogo({ size = 48, className = "", alt = "Bureau of Fire Protection — Makati City", priority = false }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt={alt}
      width={size}
      height={size}
      className={`station-logo ${className}`.trim()}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  );
}
