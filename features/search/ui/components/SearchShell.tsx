import type { ComponentChildren } from "preact";
import type { SearchLayout } from "@/features/search/ui/types";

export function SearchShell({
  layout,
  onClose,
  textColor,
  issueNavigator,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  textColor: string;
  issueNavigator?: boolean;
  children: ComponentChildren;
}) {
  if (layout === "popup") {
    return (
      <div class="flex h-full flex-col" style={{ color: textColor }}>
        {children}
      </div>
    );
  }

  return (
    <div
      class="bg-zen-overlay flex h-full w-full items-center justify-center backdrop-blur-[8px]"
      onClick={onClose}
      style={{ color: textColor }}
    >
      <div
        class="from-zen-bg to-zen-raised flex h-auto shrink-0 flex-col overflow-hidden rounded-2xl bg-linear-to-br p-[16px] text-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        data-omnibar
        data-omnibar-aspect={issueNavigator ? "3/2" : "1/1"}
      >
        {children}
      </div>
    </div>
  );
}
