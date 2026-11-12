/**
 * States shared by every form control (input, native select, textarea): hover, keyboard
 * focus, invalid and disabled. Controls are taller on phones (40 px) so they are easy to tap
 * with a finger, and compact from the `md` breakpoint.
 */
export const FIELD_STATES =
  "border-input bg-input/30 hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 w-full min-w-0 rounded-lg border text-base transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export const FIELD_HEIGHT = "h-10 md:h-8";
