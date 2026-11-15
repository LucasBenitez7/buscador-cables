import * as React from "react";
import { cn } from "cn";
import { FIELD_HEIGHT, FIELD_STATES } from "./field-styles";

/** Native `<select>` with the same states as `Input` (works with any keyboard and screen reader). */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(FIELD_STATES, FIELD_HEIGHT, "cursor-pointer px-2.5", className)}
      {...props}
    />
  );
}

export { NativeSelect };
