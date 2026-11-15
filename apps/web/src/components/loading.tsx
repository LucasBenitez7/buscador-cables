import { cn } from "cn";
import { BrandLogo } from "@/components/brand-logo";

/** A translucent box with the shape of what is coming: it pulses while the page loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-muted/50 rounded-md motion-safe:animate-pulse", className)}
    />
  );
}

/**
 * The logo with a ring turning around it: what is shown while something loads. Announced to
 * screen readers once ("Cargando…"); without the ring turning for whoever prefers less motion.
 */
export function BrandLoader({
  label = "Cargando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-3", className)}
    >
      <div className="relative size-14">
        <span
          aria-hidden
          className="border-primary/20 border-t-primary absolute -inset-1.5 rounded-[1.25rem] border-2 [animation-duration:1.4s] motion-safe:animate-spin"
        />
        <BrandLogo className="size-14 motion-safe:animate-pulse" />
      </div>
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}

/** Title, a line of text and the boxes of a page while it loads. */
export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <BrandLoader className="py-4" />
      {children ?? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Rows of a list or table while it loads. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-11" />
      ))}
    </div>
  );
}
