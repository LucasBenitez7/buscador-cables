import * as React from "react";
import { cn } from "cn";
import { FIELD_STATES } from "./field-styles";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD_STATES, "placeholder:text-muted-foreground px-2.5 py-1.5", className)}
      {...props}
    />
  );
}

export { Textarea };
