import { useEffect, useRef, useState } from "preact/hooks";
import {
  parseHostOverrideDraft,
  type HostOverrideDraft,
  type HostOverrideScope,
} from "@/features/hosts/model/host-override";
import type { HostOverrideGroup } from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import {
  fieldClass,
  primaryButtonClass,
  scopeButtonClass,
  secondaryButtonClass,
} from "@/features/hosts/ui/lib/styles";

const SCOPES: { scope: HostOverrideScope; label: string }[] = [
  { scope: "tab", label: "This tab" },
  { scope: "global", label: "All tabs" },
];

export interface HostGroupFormProps {
  initial: HostOverrideDraft;
  submitLabel: string;
  onSubmit(group: HostOverrideGroup, scope: HostOverrideScope): void;
  onCancel(): void;
}

/** Edits one IP group: the IP, its description and the hostnames routed to it. */
export function HostGroupForm({ initial, submitLabel, onSubmit, onCancel }: HostGroupFormProps) {
  const ipRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();

  useEffect(() => {
    ipRef.current?.focus();
  }, []);

  const update = (patch: Partial<HostOverrideDraft>) => {
    setError(undefined);
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <form
      class="border-zen-line bg-zen-panel flex flex-col gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]"
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseHostOverrideDraft(draft);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onSubmit(result.group, draft.scope);
      }}
    >
      <div
        class="flex gap-[var(--zen-space-1)]"
        role="radiogroup"
        aria-label="Where this override applies"
      >
        {SCOPES.map(({ scope, label }) => (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={draft.scope === scope}
            class={scopeButtonClass(draft.scope === scope)}
            onClick={() => update({ scope })}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="flex flex-wrap gap-[var(--zen-space-2)]">
        <label class="text-zen-faint flex min-w-0 flex-[1_1_9em] flex-col gap-[var(--zen-space-1)] text-[length:var(--zen-text-sm)]">
          IP address
          <input
            ref={ipRef}
            class={fieldClass}
            type="text"
            spellcheck={false}
            placeholder="10.0.0.12"
            value={draft.ip}
            onInput={(event) => update({ ip: event.currentTarget.value })}
          />
        </label>
        <label class="text-zen-faint flex min-w-0 flex-[1.4_1_11em] flex-col gap-[var(--zen-space-1)] text-[length:var(--zen-text-sm)]">
          Description
          <input
            class={fieldClass}
            type="text"
            placeholder="Staging"
            value={draft.description}
            onInput={(event) => update({ description: event.currentTarget.value })}
          />
        </label>
      </div>
      <label class="text-zen-faint flex flex-col gap-[var(--zen-space-1)] text-[length:var(--zen-text-sm)]">
        Hostnames (one per line, *.example.com for subdomains)
        <textarea
          class={cn(
            fieldClass,
            "h-auto min-h-[calc(var(--zen-font-size)*5)] py-[var(--zen-space-1)]",
          )}
          rows={4}
          spellcheck={false}
          placeholder={"example.com\napi.example.com"}
          value={draft.hostnames}
          onInput={(event) => update({ hostnames: event.currentTarget.value })}
        />
      </label>
      {error && <p class="text-zen-danger m-0 text-[length:var(--zen-text-sm)]">{error}</p>}
      <div class="flex flex-wrap justify-end gap-[var(--zen-space-2)]">
        <button class={secondaryButtonClass} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class={primaryButtonClass} type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
