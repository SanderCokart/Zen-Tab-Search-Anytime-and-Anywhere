import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "@/shared/ui/cn";
import "../hardware/field.css";

export interface TextFieldProps extends Omit<
  JSX.IntrinsicElements["input"],
  "class" | "children" | "ref"
> {
  label: string;
  class?: string;
  inputClass?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, class: className, inputClass, ...props }, ref) => (
    <label data-kit="field" class={cn("flex flex-col gap-[var(--zen-space-2)]", className)}>
      <span data-kit="label">{label}</span>
      <input
        {...props}
        ref={ref}
        data-kit="input"
        class={cn(
          "w-full min-w-0 rounded-[var(--zen-radius)] border border-transparent bg-transparent px-[var(--zen-space-2)] font-[inherit] text-inherit outline-none",
          inputClass,
        )}
      />
    </label>
  ),
);
