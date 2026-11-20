/**
 * PROTOTYPE. Throwaway. Not production.
 *
 * Three variants of bulk-clearing todos with an optional close: switchable via
 * `?variant=`, on the screenshot harness scene `prototype-todo-clear`.
 *
 * A Twin keys — two commits in the confirm well.
 * B Close latch — one commit, optional “also close” modifier.
 * C Menu owns close — Clear… lists Mark done vs Mark done and close.
 */
import { useEffect, useState } from "preact/hooks";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { TODO_NAVIGATOR_PREFIXES } from "@/features/search/model/ranking";
import { SearchShell } from "@/features/search/ui/components/SearchShell";
import { applyPreset } from "@/features/settings/model/complexity";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import { statusRowClass } from "@/features/status/ui/traffic-light";
import { TodoIcon } from "@/features/todos/ui/TodoIcon";
import type { TrafficLight } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

type VariantKey = "A" | "B" | "C";

const VARIANTS: { key: VariantKey; name: string }[] = [
  { key: "A", name: "Twin keys" },
  { key: "B", name: "Close latch" },
  { key: "C", name: "Menu owns close" },
];

type ClearFilter = "all" | TrafficLight;
type LastAction = {
  op: "done" | "done-close" | "cancel";
  filter: ClearFilter;
  count: number;
};

const SEED: { title: string; meta: string; light?: TrafficLight }[] = [
  { title: "ISSUE: #123 - Fix the search results", meta: "gitlab.com", light: "orange" },
  { title: "Release checklist", meta: "Docs", light: "red" },
  { title: "Staging dashboard", meta: "Work" },
];

function parseVariant(search: string): VariantKey {
  const value = new URLSearchParams(search).get("variant")?.toUpperCase();
  return value === "B" || value === "C" ? value : "A";
}

function setVariantInUrl(next: VariantKey): void {
  const params = new URLSearchParams(window.location.search);
  params.set("scene", "prototype-todo-clear");
  params.set("variant", next);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

function idsFor(rows: typeof SEED, filter: ClearFilter): number[] {
  return rows.flatMap((row, index) => (filter === "all" || row.light === filter ? [index] : []));
}

function confirmCopy(filter: ClearFilter, count: number, close: boolean): string {
  const which = filter === "all" ? "" : ` with status ${filter}`;
  const todos = count === 1 ? "1 todo" : `${count} todos`;
  if (close) {
    return `Mark ${todos}${which} as done and close their tabs?`;
  }
  return `Mark ${todos}${which} as done?`;
}

const wellClass =
  "zs-well mb-[var(--zen-space-2)] flex min-w-0 flex-col gap-[var(--zen-space-2)] rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]";
const redKey =
  "zs-key zs-key-red px-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)]";
const quietKey = "zs-key px-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)]";
const cancelClass =
  "text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)] hover:underline";

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (next: VariantKey) => void;
}) {
  const index = VARIANTS.findIndex((item) => item.key === current);
  const label = VARIANTS[index];
  const step = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    if (next) onChange(next.key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  if (import.meta.env.PROD) return null;

  return (
    <div
      class="pointer-events-auto fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-black/85 px-3 py-2 font-mono text-xs tracking-wide text-white shadow-lg"
      data-prototype-switcher
    >
      <button
        type="button"
        class="cursor-pointer border-0 bg-transparent px-2 text-white"
        onClick={() => step(-1)}
      >
        ←
      </button>
      <span>
        {label?.key} ({label?.name})
      </span>
      <button
        type="button"
        class="cursor-pointer border-0 bg-transparent px-2 text-white"
        onClick={() => step(1)}
      >
        →
      </button>
    </div>
  );
}

function FakeRow({ title, meta, light }: { title: string; meta: string; light?: TrafficLight }) {
  return (
    <div
      class={cn(
        "relative flex w-full min-w-0 flex-col gap-[calc(var(--zen-font-size)*0.43)] rounded-[var(--zen-radius-lg)]",
        "px-[var(--zen-space-3)] py-[calc(var(--zen-space-3)+var(--zen-todo-pad))]",
        statusRowClass(light, false),
      )}
    >
      <span class={cn("min-w-0", entryTextClass(true))}>{title}</span>
      <div class="text-zen-muted flex min-w-0 items-center justify-between font-mono text-[length:var(--zen-text-xs)] tracking-[0.04em]">
        <span class={cn("min-w-0", entryTextClass(true))}>{meta}</span>
        <span class="text-zen-muted uppercase">Mark as done</span>
      </div>
    </div>
  );
}

function ClearCounts({ rows }: { rows: typeof SEED }) {
  return (
    <>
      {([{ light: "all" as const, label: "All" }, ...TRAFFIC_LIGHT_OPTIONS] as const).map(
        ({ light, label }) => {
          const count = idsFor(rows, light).length;
          return (
            <option key={light} value={light} disabled={count === 0}>
              {label} ({count})
            </option>
          );
        },
      )}
    </>
  );
}

function StateLcd({ last, extra }: { last: LastAction | null; extra?: string }) {
  return (
    <p class="zs-lcd m-0 mt-[var(--zen-space-2)] px-[var(--zen-space-2)] py-[var(--zen-space-1)] font-mono text-[length:var(--zen-text-xs)] tracking-normal normal-case">
      last: {last ? `${last.op} filter=${last.filter} count=${last.count}` : "none"}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

function VariantA() {
  const [rows, setRows] = useState(SEED);
  const [pending, setPending] = useState<ClearFilter | null>("all");
  const [last, setLast] = useState<LastAction | null>(null);
  const pendingIds = pending === null ? [] : idsFor(rows, pending);

  const finish = (close: boolean) => {
    if (pending === null) return;
    setLast({ op: close ? "done-close" : "done", filter: pending, count: pendingIds.length });
    setRows(rows.filter((_, index) => !pendingIds.includes(index)));
    setPending(null);
  };

  return (
    <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]">
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{rows.length} to do</span>
          <select
            class="zs-key text-zen-subtle h-[var(--zen-mini-key)] appearance-none py-0 pr-[var(--zen-space-6)] pl-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)]"
            aria-label="Clear todos"
            value=""
            onChange={(event) => {
              const filter = event.currentTarget.value as ClearFilter;
              event.currentTarget.value = "";
              if (idsFor(rows, filter).length > 0) setPending(filter);
            }}
          >
            <option value="" disabled>
              Clear…
            </option>
            <ClearCounts rows={rows} />
          </select>
        </span>
      </div>
      {pending !== null && pendingIds.length > 0 && (
        <div class={wellClass} role="alertdialog" aria-label="Confirm clearing todos">
          <span>{confirmCopy(pending, pendingIds.length, false)}</span>
          <span class="flex flex-wrap items-center justify-end gap-[var(--zen-space-2)]">
            <button type="button" class={quietKey} onClick={() => finish(false)}>
              Mark done
            </button>
            <button type="button" class={redKey} onClick={() => finish(true)}>
              Done & close
            </button>
            <button
              type="button"
              class={cancelClass}
              onClick={() => {
                setLast({ op: "cancel", filter: pending, count: pendingIds.length });
                setPending(null);
              }}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      <div class="zen-scroll flex min-h-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-y-auto">
        {rows.map((row) => (
          <FakeRow key={row.title} {...row} />
        ))}
      </div>
      <StateLcd last={last} extra="two commits, close is the red one" />
    </aside>
  );
}

function VariantB() {
  const [rows, setRows] = useState(SEED);
  const [pending, setPending] = useState<ClearFilter | null>("all");
  const [closeTabs, setCloseTabs] = useState(false);
  const [last, setLast] = useState<LastAction | null>(null);
  const pendingIds = pending === null ? [] : idsFor(rows, pending);

  return (
    <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]">
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{rows.length} to do</span>
          <select
            class="zs-key text-zen-subtle h-[var(--zen-mini-key)] appearance-none py-0 pr-[var(--zen-space-6)] pl-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)]"
            aria-label="Clear todos"
            value=""
            onChange={(event) => {
              const filter = event.currentTarget.value as ClearFilter;
              event.currentTarget.value = "";
              if (idsFor(rows, filter).length > 0) {
                setCloseTabs(false);
                setPending(filter);
              }
            }}
          >
            <option value="" disabled>
              Clear…
            </option>
            <ClearCounts rows={rows} />
          </select>
        </span>
      </div>
      {pending !== null && pendingIds.length > 0 && (
        <div class={wellClass} role="alertdialog" aria-label="Confirm clearing todos">
          <span>{confirmCopy(pending, pendingIds.length, closeTabs)}</span>
          <button
            type="button"
            class="text-zen-subtle hover:text-zen-text flex cursor-pointer items-center gap-[var(--zen-space-2)] border-0 bg-transparent p-0 text-left font-[inherit] text-[length:var(--zen-text-sm)]"
            aria-pressed={closeTabs}
            onClick={() => setCloseTabs((value) => !value)}
          >
            <TodoIcon checked={closeTabs} class="size-[var(--zen-icon-sm)]" />
            Also close these tabs
          </button>
          <span class="flex items-center justify-end gap-[var(--zen-space-2)]">
            <button
              type="button"
              class={closeTabs ? redKey : quietKey}
              onClick={() => {
                setLast({
                  op: closeTabs ? "done-close" : "done",
                  filter: pending,
                  count: pendingIds.length,
                });
                setRows(rows.filter((_, index) => !pendingIds.includes(index)));
                setPending(null);
              }}
            >
              Mark done
            </button>
            <button
              type="button"
              class={cancelClass}
              onClick={() => {
                setLast({ op: "cancel", filter: pending, count: pendingIds.length });
                setPending(null);
              }}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      <div class="zen-scroll flex min-h-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-y-auto">
        {rows.map((row) => (
          <FakeRow key={row.title} {...row} />
        ))}
      </div>
      <StateLcd last={last} extra={`close latch=${closeTabs ? "on" : "off"}`} />
    </aside>
  );
}

function VariantC() {
  const [rows, setRows] = useState(SEED);
  const [menuOpen, setMenuOpen] = useState(true);
  const [pending, setPending] = useState<{ filter: ClearFilter; close: boolean } | null>(null);
  const [last, setLast] = useState<LastAction | null>(null);
  const pendingIds = pending === null ? [] : idsFor(rows, pending.filter);
  const filters = [{ light: "all" as const, label: "All" }, ...TRAFFIC_LIGHT_OPTIONS];

  const pick = (filter: ClearFilter, close: boolean) => {
    if (idsFor(rows, filter).length === 0) return;
    setMenuOpen(false);
    setPending({ filter, close });
  };

  return (
    <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]">
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{rows.length} to do</span>
          <span class="relative">
            <button
              type="button"
              class="zs-key text-zen-subtle h-[var(--zen-mini-key)] px-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)]"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              Clear…
            </button>
            {menuOpen && (
              <div class="zs-card absolute top-full right-0 z-20 mt-[var(--zen-space-1)] min-w-[calc(var(--zen-font-size)*14)] p-[var(--zen-space-2)] shadow-lg">
                <p class="text-zen-muted m-0 mb-[var(--zen-space-1)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.12em] uppercase">
                  Mark done
                </p>
                {filters.map(({ light, label }) => {
                  const count = idsFor(rows, light).length;
                  return (
                    <button
                      key={`done-${light}`}
                      type="button"
                      disabled={count === 0}
                      class="hover:bg-zen-line-soft flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit] text-[length:var(--zen-text-sm)] disabled:opacity-40"
                      onClick={() => pick(light, false)}
                    >
                      <span>{label}</span>
                      <span class="text-zen-muted">{count}</span>
                    </button>
                  );
                })}
                <p class="text-zen-muted m-0 mt-[var(--zen-space-2)] mb-[var(--zen-space-1)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.12em] uppercase">
                  Mark done and close
                </p>
                {filters.map(({ light, label }) => {
                  const count = idsFor(rows, light).length;
                  return (
                    <button
                      key={`close-${light}`}
                      type="button"
                      disabled={count === 0}
                      class="hover:bg-zen-line-soft flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit] text-[length:var(--zen-text-sm)] disabled:opacity-40"
                      onClick={() => pick(light, true)}
                    >
                      <span>{label}</span>
                      <span class="text-zen-muted">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </span>
        </span>
      </div>
      {pending !== null && pendingIds.length > 0 && (
        <div class={wellClass} role="alertdialog" aria-label="Confirm clearing todos">
          <span class="flex min-w-0 items-center justify-between gap-[var(--zen-space-2)]">
            <span class="min-w-0 truncate">
              {confirmCopy(pending.filter, pendingIds.length, pending.close)}
            </span>
            <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
              <button
                type="button"
                class={pending.close ? redKey : quietKey}
                onClick={() => {
                  setLast({
                    op: pending.close ? "done-close" : "done",
                    filter: pending.filter,
                    count: pendingIds.length,
                  });
                  setRows(rows.filter((_, index) => !pendingIds.includes(index)));
                  setPending(null);
                }}
              >
                {pending.close ? "Done & close" : "Mark done"}
              </button>
              <button
                type="button"
                class={cancelClass}
                onClick={() => {
                  setLast({
                    op: "cancel",
                    filter: pending.filter,
                    count: pendingIds.length,
                  });
                  setPending(null);
                }}
              >
                Cancel
              </button>
            </span>
          </span>
        </div>
      )}
      <div class="zen-scroll flex min-h-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-y-auto">
        {rows.map((row) => (
          <FakeRow key={row.title} {...row} />
        ))}
      </div>
      <StateLcd last={last} extra={menuOpen ? "Clear menu open" : "menu closed"} />
    </aside>
  );
}

export function PrototypeTodoClearClose() {
  const [variant, setVariant] = useState<VariantKey>(() => parseVariant(window.location.search));
  const displaySettings = { ...DEFAULT_DISPLAY_SETTINGS, ...applyPreset("dev") };

  const choose = (next: VariantKey) => {
    setVariantInUrl(next);
    setVariant(next);
  };

  return (
    <>
      <SearchShell
        layout="overlay"
        onClose={() => undefined}
        displaySettings={displaySettings}
        aspect="3/2"
      >
        <div class="flex min-h-0 min-w-0 flex-1 gap-[var(--zen-space-6)]" data-omnibar-columns>
          <aside class="zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]">
            <div class="zs-head">
              <strong class="font-[inherit] font-medium">Tabs</strong>
              <span class="zs-head-rule" aria-hidden="true" />
              <span>12</span>
            </div>
            <p class="text-zen-muted m-0 text-[length:var(--zen-text-sm)]">
              Prototype: only the todo column changes. Arrow keys or the bar cycle A / B / C.
            </p>
          </aside>
          {variant === "A" && <VariantA />}
          {variant === "B" && <VariantB />}
          {variant === "C" && <VariantC />}
        </div>
      </SearchShell>
      <PrototypeSwitcher current={variant} onChange={choose} />
    </>
  );
}
