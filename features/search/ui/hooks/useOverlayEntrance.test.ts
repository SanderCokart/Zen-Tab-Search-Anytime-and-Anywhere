import { h, render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { useOverlayEntrance } from "@/features/search/ui/hooks/useOverlayEntrance";

function Harness({
  enabled,
  ready,
  onOpen,
}: {
  enabled: boolean;
  ready: boolean;
  onOpen: (open: boolean) => void;
}) {
  const open = useOverlayEntrance(enabled, ready);
  onOpen(open);
  return null;
}

function mount(enabled: boolean, ready: boolean) {
  const values: boolean[] = [];
  const root = document.createElement("div");
  const onOpen = (open: boolean) => values.push(open);
  render(h(Harness, { enabled, ready, onOpen }), root);
  return {
    values,
    rerender: (nextEnabled: boolean, nextReady: boolean) => {
      render(h(Harness, { enabled: nextEnabled, ready: nextReady, onOpen }), root);
    },
    unmount: () => {
      render(null, root);
    },
  };
}

describe("useOverlayEntrance", () => {
  it("opens the popup immediately", () => {
    const { values, unmount } = mount(false, false);
    expect(values.at(-1)).toBe(true);
    unmount();
  });

  it("keeps the overlay closed until data is ready, then opens after layout", async () => {
    const { values, rerender, unmount } = mount(true, false);
    expect(values.at(-1)).toBe(false);

    rerender(true, true);
    expect(values.at(-1)).toBe(false);

    await vi.waitFor(() => expect(values.at(-1)).toBe(true));
    unmount();
  });
});
