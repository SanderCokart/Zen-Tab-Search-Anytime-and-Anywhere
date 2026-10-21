import { render } from "preact";
import type { ComponentChildren } from "preact";
import { SearchApp } from "@/features/search/ui/SearchApp";
import { DisplaySettingsApp } from "@/features/settings/ui/DisplaySettingsApp";
import { TimerPopup } from "@/features/timers/ui/TimerPopup";
import { HostOverridesPopup } from "@/features/hosts/ui/HostOverridesPopup";
import { installBrowserMock } from "@/screenshots/browser-mock";
import { displaySettingsFor, sceneFromSearch } from "@/screenshots/scenes";
import "@/shared/ui/styles.css";
import "@/screenshots/harness.css";

const scene = sceneFromSearch(window.location.search);
installBrowserMock(displaySettingsFor(scene), { updateAvailable: scene.updateAvailable });
document.documentElement.dataset.harnessScene = scene.id;

function FakeZenChrome({
  children,
  address = "docs.example.com/architecture",
}: {
  children: ComponentChildren;
  address?: string;
}) {
  return (
    <div class="flex h-full flex-col bg-[#161616] text-[#f5f5f5]">
      <div class="flex h-10 shrink-0 items-center gap-3 border-b border-white/10 px-3 text-xs text-white/55">
        <span class="rounded bg-white/10 px-2 py-0.5 text-white/80">Work</span>
        <span class="min-w-0 flex-1 truncate rounded bg-black/40 px-3 py-1">{address}</span>
      </div>
      <div class="relative min-h-0 flex-1 bg-[#0f0f0f]">{children}</div>
    </div>
  );
}

function PopupFrame({ children }: { children: ComponentChildren }) {
  return (
    <FakeZenChrome>
      <div class="flex h-full items-start justify-end p-6">
        <div
          class="h-[420px] w-[380px] overflow-hidden rounded-lg border border-white/15 bg-[#1e1e1e] p-2 shadow-2xl"
          data-harness-popup
        >
          {children}
        </div>
      </div>
    </FakeZenChrome>
  );
}

function CardFrame({ children, widthClass }: { children: ComponentChildren; widthClass: string }) {
  return (
    <FakeZenChrome>
      <div class="flex h-full items-start justify-end p-6">
        <div
          class={`${widthClass} rounded-lg border border-white/15 bg-[#1e1e1e] p-3 shadow-2xl`}
          data-harness-card
        >
          {children}
        </div>
      </div>
    </FakeZenChrome>
  );
}

function HarnessApp() {
  if (scene.surface === "settings") {
    return <DisplaySettingsApp />;
  }
  if (scene.surface === "timer") {
    return (
      <CardFrame widthClass="w-[380px]">
        <TimerPopup tabId={1} onClose={() => undefined} />
      </CardFrame>
    );
  }
  if (scene.surface === "hosts") {
    return (
      <CardFrame widthClass="w-[440px]">
        <HostOverridesPopup tabId={9} onClose={() => undefined} />
      </CardFrame>
    );
  }

  const search = (
    <SearchApp
      onClose={() => undefined}
      layout={scene.layout ?? "overlay"}
      initialView={scene.initialView}
    />
  );

  if (scene.layout === "popup") {
    return <PopupFrame>{search}</PopupFrame>;
  }

  return <FakeZenChrome>{search}</FakeZenChrome>;
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing screenshot harness mount.");
}

render(<HarnessApp />, root);
