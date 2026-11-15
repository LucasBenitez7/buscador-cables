import * as React from "react";
import { cn } from "cn";
import { FIELD_HEIGHT, FIELD_STATES } from "./field-styles";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD_STATES,
        FIELD_HEIGHT,
        "placeholder:text-muted-foreground file:text-foreground px-2.5 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
