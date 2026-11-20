import { useEffect, useRef, useState } from "preact/hooks";
import {
  organizeForgeConfirmMessage,
  organizeForgePreviewTree,
  type ForgeOrganizeMode,
} from "@/features/forge/model/forge-tab-organize";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { cn } from "@/shared/ui/cn";
import { ConfirmWell } from "@/shared/ui/primitives/ConfirmWell";
import { MenuPanel, useDropdown } from "@/shared/ui/primitives/Menu";
import { TOOLTIP_DELAY_MS } from "@/shared/ui/primitives/Tooltip";

/** Lucide Boxes: stacked cartons, for folding tabs into folders. */
function OrganizeBoxesIcon({ class: className }: { class?: string }) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="m7 16.5 5-3" />
      <path d="M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" />
      <path d="m17 16.5 4.74-2.85" />
      <path d="M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" />
      <path d="m12 8 4.74-2.85" />
      <path d="M12 13.5V8" />
    </svg>
  );
}

export function OrganizeForgeMenu({
  tabCount,
  confirm,
  onOrganize,
  onConfirmChange,
}: {
  tabCount: number;
  confirm: boolean;
  onOrganize: (mode: ForgeOrganizeMode) => void;
  onConfirmChange?: (confirm: boolean) => void;
}) {
  const [pending, setPending] = useState<ForgeOrganizeMode | null>(null);
  const [preview, setPreview] = useState<ForgeOrganizeMode | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  // Mirrors `dontAsk` for `runPending`: a tick of the checkbox and a click on
  // Organize can land before Preact re-renders, so the closure would be stale.
  const dontAskRef = useRef(false);
  const previewTimer = useRef<number | null>(null);
  const disabled = tabCount === 0;
  const dropdown = useDropdown("[data-testid='zen-organize-forge-wrap']");

  const showPreview = (mode: ForgeOrganizeMode) => {
    window.clearTimeout(previewTimer.current ?? undefined);
    previewTimer.current = window.setTimeout(() => setPreview(mode), TOOLTIP_DELAY_MS);
  };
  const hidePreview = () => {
    window.clearTimeout(previewTimer.current ?? undefined);
    setPreview(null);
  };
  useEffect(() => () => window.clearTimeout(previewTimer.current ?? undefined), []);

  const choose = (mode: ForgeOrganizeMode) => {
    if (confirm) {
      dontAskRef.current = false;
      setDontAsk(false);
      setPending(mode);
      return;
    }
    onOrganize(mode);
  };

  const runPending = () => {
    if (pending === null) {
      return;
    }
    if (dontAskRef.current) {
      onConfirmChange?.(false);
    }
    onOrganize(pending);
    setPending(null);
  };

  return (
    <>
      <span
        class="relative inline-flex shrink-0 items-center"
        data-testid="zen-organize-forge-wrap"
      >
        <TooltipButton
          label="Organize issue tabs into folders"
          tooltip="Put open issue tabs into matching Zen folders"
          data-testid="zen-organize-forge"
          class={cn(
            "zs-key relative inline-flex shrink-0 items-center justify-center p-0 font-[inherit]",
            "h-[calc(var(--zen-font-size)*2.286+var(--zen-space-1)*2)] w-[calc(var(--zen-font-size)*2.286+var(--zen-space-1)*2)]",
            "rounded-[var(--zs-r-seg)]",
          )}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={dropdown.open}
          onClick={dropdown.toggle}
        >
          <OrganizeBoxesIcon class="size-[var(--zen-icon-md)]" />
        </TooltipButton>
        {dropdown.open && (
          <MenuPanel
            align="right"
            class="min-w-[calc(var(--zen-font-size)*12)]"
            data-testid="zen-organize-forge-menu"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseLeave={hidePreview}
          >
            {(
              [
                {
                  mode: "tree",
                  label: "As in this list",
                  testId: "zen-organize-forge-tree",
                },
                {
                  mode: "byIssue",
                  label: "Group with issues",
                  testId: "zen-organize-forge-by-issue",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.mode}
                type="button"
                role="menuitem"
                data-testid={option.testId}
                class="zs-label text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit]"
                onMouseEnter={() => showPreview(option.mode)}
                onFocus={() => showPreview(option.mode)}
                onBlur={hidePreview}
                onClick={() => {
                  hidePreview();
                  dropdown.close();
                  choose(option.mode);
                }}
              >
                {option.label}
              </button>
            ))}
            {preview && (
              <div
                class={cn(
                  "zs-lcd pointer-events-none absolute top-0 right-full mr-[var(--zen-space-2)]",
                  "px-[var(--zen-space-3)] py-[var(--zen-space-2)]",
                )}
                data-testid="zen-organize-forge-preview"
                role="tooltip"
              >
                <pre class="m-0 font-mono text-[length:var(--zen-text-xs)] leading-snug font-normal tracking-normal whitespace-pre normal-case">
                  {organizeForgePreviewTree(preview)}
                </pre>
              </div>
            )}
          </MenuPanel>
        )}
      </span>
      {pending !== null && tabCount > 0 && (
        <ConfirmWell
          layout="stack"
          label="Confirm organizing issue tabs"
          testId="zen-organize-forge-confirm"
          message={organizeForgeConfirmMessage(pending, tabCount)}
          confirmLabel="Organize"
          confirmTestId="zen-organize-forge-confirm-button"
          cancelTestId="zen-organize-forge-cancel-button"
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        >
          <label class="text-zen-subtle flex min-w-0 items-center gap-[var(--zen-space-2)]">
            <input
              type="checkbox"
              class="accent-[var(--zen-text)]"
              data-testid="zen-organize-forge-dont-ask"
              checked={dontAsk}
              onChange={(event) => {
                dontAskRef.current = event.currentTarget.checked;
                setDontAsk(event.currentTarget.checked);
              }}
            />
            Don&apos;t ask this again
          </label>
        </ConfirmWell>
      )}
    </>
  );
}
