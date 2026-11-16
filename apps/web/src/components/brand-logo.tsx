import { cn } from "cn";

/**
 * The logo of the app: a magnifying glass whose handle is a cable ending in a plug. The same
 * drawing as `public/brand/logo.svg` (favicon, emails and the image to share).
 */
export function BrandLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="64" height="64" rx="14" className="fill-background" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="13.25"
        fill="none"
        className="stroke-border"
        strokeWidth="1.5"
      />
      <circle cx="25" cy="25" r="12" fill="none" className="stroke-primary" strokeWidth="5" />
      <path
        d="M19.8 25a5.2 5.2 0 0 1 5.2-5.2"
        fill="none"
        className="stroke-primary/60"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M33.5 33.5c3.8 3.8 1.8 8.5 5.6 12.3s8.4 2.6 10.2.8"
        fill="none"
        className="stroke-primary"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect
        x="45"
        y="40.5"
        width="8.5"
        height="8.5"
        rx="2"
        transform="rotate(-40 49.25 44.75)"
        className="fill-warning"
      />
      <path
        d="M51.2 37.6l2.7-3.1M54.6 40.6l3.1-2.7"
        className="stroke-warning"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
