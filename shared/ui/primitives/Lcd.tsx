import type { ComponentChildren } from "preact";
import { cn } from "@/shared/ui/cn";

/** A black display well with light text, the same in both themes. */
export function Lcd({
  class: className,
  "data-testid": testId,
  children,
}: {
  class?: string;
  "data-testid"?: string;
  children?: ComponentChildren;
}) {
  return (
    <div class={cn("zs-lcd", className)} data-testid={testId}>
      {children}
    </div>
  );
}
