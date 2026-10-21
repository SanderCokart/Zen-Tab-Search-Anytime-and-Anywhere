import { useState } from "preact/hooks";
import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { versionSegments } from "@/features/updates/model/version";
import { useUpdateStatus } from "@/features/updates/ui/hooks/useUpdateStatus";
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

/**
 * A line above the search saying a newer release is out. Clicking it opens the
 * choices: install it in place, download the zip, or read the release notes.
 * Renders nothing while the installed version is the latest.
 */
export function UpdateNotice() {
  const status = useUpdateStatus();
  const [open, setOpen] = useState(false);
  const [install, setInstall] = useState<InstallState>({ kind: "idle" });

  if (!status?.updateAvailable || !status.latest) {
    return null;
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
    <div
      class="mb-[var(--zen-space-2)] flex min-w-0 flex-col gap-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]"
      data-testid="zen-update-notice"
    >
      <TooltipButton
        label={`New version available. Latest: ${latest.version}`}
        tooltip={
          status.demo
            ? `You are on version ${currentVersion}. Debug build: shown so it can replace itself.`
            : `You are on version ${currentVersion}`
        }
        aria-expanded={open}
        class="text-zen-subtle hover:text-zen-text flex min-w-0 cursor-pointer items-center gap-[var(--zen-space-1)] self-start border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-sm)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⬆</span>
        <span class="truncate">There is a new version available! Latest:</span>
        <LatestVersion latest={latest.version} current={currentVersion} />
        {status.demo && <span class="text-zen-muted">(debug demo)</span>}
      </TooltipButton>
      {open && (
        <div
          class="border-zen-line flex min-w-0 flex-col gap-[var(--zen-space-2)] rounded-[var(--zen-radius)] border p-[var(--zen-space-2)]"
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
