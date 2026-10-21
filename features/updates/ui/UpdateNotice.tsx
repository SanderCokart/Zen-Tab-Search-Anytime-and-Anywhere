import { useState } from "preact/hooks";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { versionSegments } from "@/features/updates/model/version";
import { formatLastChecked } from "@/features/updates/model/checked-at";
import {
  useUpdateStatus,
  type UpdateCheckState,
} from "@/features/updates/ui/hooks/useUpdateStatus";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import { cn } from "@/shared/ui/cn";

type InstallState = { kind: "idle" } | { kind: "installing" } | { kind: "failed"; error: string };

const actionClass =
  "border-zen-line bg-zen-chip text-zen-text cursor-pointer rounded-[var(--zen-radius)] border px-[var(--zen-space-2)] py-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)] hover:underline disabled:cursor-default disabled:opacity-60";

/** `4.0.2` with the parts that differ from the installed version in green. */
function LatestVersion({ latest, current }: { latest: string; current: string }) {
  return (
    <span data-testid="zen-update-latest">
      {versionSegments(latest, current).map(({ text, changed }, index) => (
        <span key={index}>
          {index > 0 && "."}
          <span
            class={cn(changed && "font-semibold text-green-400")}
            data-changed={changed || undefined}
          >
            {text}
          </span>
        </span>
      ))}
    </span>
  );
}

const linkButtonClass =
  "text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-xs)] hover:underline disabled:cursor-default disabled:no-underline";

function checkResultText(state: UpdateCheckState): string | undefined {
  if (state.kind === "upToDate") return "Up to date";
  if (state.kind === "failed") return "Could not reach GitHub";
  return undefined;
}

/**
 * The update end of the status bar. While the installed version is the latest
 * it shows that version and a "Check for updates" button that asks GitHub now.
 * When a newer release is out it says so instead; clicking that opens the
 * choices above the bar: install it in place, download the zip, or read the
 * release notes.
 */
export function UpdateNotice() {
  const { status, checkState, check } = useUpdateStatus();
  const [open, setOpen] = useState(false);
  const [install, setInstall] = useState<InstallState>({ kind: "idle" });

  if (!status) {
    return null;
  }

  if (!status.updateAvailable || !status.latest) {
    const result = checkResultText(checkState);
    return (
      <span
        class="flex min-w-0 shrink-0 items-center gap-[var(--zen-space-2)]"
        data-testid="zen-update-check"
      >
        {result && (
          <span
            class={cn(checkState.kind === "failed" ? "text-zen-danger" : "text-zen-muted")}
            role="status"
            data-testid="zen-update-result"
          >
            {result}
          </span>
        )}
        <span class="text-zen-muted">v{status.currentVersion}</span>
        <TooltipButton
          label="Check for updates"
          tooltip={formatLastChecked(status.checkedAt, Date.now())}
          class={linkButtonClass}
          disabled={checkState.kind === "checking"}
          data-testid="zen-update-check-button"
          onClick={check}
        >
          {checkState.kind === "checking" ? "Checking…" : "Check for updates"}
        </TooltipButton>
      </span>
    );
  }
  const { currentVersion, latest } = status;

  const openPage = (page: "download" | "releaseNotes") =>
    void sendExtensionMessage({ type: "openUpdate", page }).catch((error) =>
      debugError("Could not open the update:", error),
    );

  const installNow = () => {
    setInstall({ kind: "installing" });
    // On success the add-on restarts on the new version and this page goes with it.
    void sendExtensionMessage({ type: "installUpdate" }).catch((error: unknown) =>
      setInstall({
        kind: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  return (
    <div class="relative flex min-w-0 shrink" data-testid="zen-update-notice">
      <TooltipButton
        label={`New version available. Latest: ${latest.version}`}
        tooltip={
          status.demo
            ? `You are on version ${currentVersion}. Debug build: shown so it can replace itself.`
            : `You are on version ${currentVersion}`
        }
        aria-expanded={open}
        class="text-zen-text flex min-w-0 cursor-pointer items-center gap-[var(--zen-space-1)] border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-xs)] hover:underline"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" class="text-green-400">
          ⬆
        </span>
        <span class="truncate">There is a new version available! Latest:</span>
        <LatestVersion latest={latest.version} current={currentVersion} />
        {status.demo && <span class="text-zen-muted">(debug demo)</span>}
      </TooltipButton>
      {open && (
        // Opens upwards, since the status bar sits at the bottom of the search.
        <div
          class={cn(
            "border-zen-line bg-zen-raised absolute right-0 bottom-full z-10 mb-[var(--zen-space-2)]",
            "flex w-max max-w-[min(32em,90vw)] flex-col gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]",
            "text-[length:var(--zen-text-sm)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
          )}
          data-testid="zen-update-panel"
        >
          <span>
            {status.demo
              ? `Debug build: replace this ${currentVersion} build with the ${latest.version} release?`
              : `Update from ${currentVersion} to ${latest.version}?`}
          </span>
          <span class="flex flex-wrap items-center gap-[var(--zen-space-2)]">
            {status.canInstall && (
              <button
                type="button"
                class={actionClass}
                disabled={install.kind === "installing"}
                data-testid="zen-update-install"
                onClick={installNow}
              >
                {install.kind === "installing" ? "Installing…" : "Install now"}
              </button>
            )}
            <button
              type="button"
              class={actionClass}
              data-testid="zen-update-download"
              onClick={() => openPage("download")}
            >
              Download zip
            </button>
            <button
              type="button"
              class="text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-sm)] hover:underline"
              onClick={() => openPage("releaseNotes")}
            >
              Release notes
            </button>
          </span>
          {install.kind === "installing" && (
            <span class="text-zen-muted">
              Zen Tab Search restarts on the new version when it is done.
            </span>
          )}
          {install.kind === "failed" && (
            <span class="text-zen-danger" role="alert">
              {install.error} You can still download the zip and install it from about:addons.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
