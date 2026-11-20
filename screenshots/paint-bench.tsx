import { render } from "preact";
import { COMPLEXITY_SETUP_DONE_KEY } from "@/features/settings/model/complexity";
import { DISPLAY_SETTINGS_STORAGE_KEY } from "@/features/settings/model/display-settings";
import { SearchApp } from "@/features/search/ui/SearchApp";
import {
  formatPaintBenchReport,
  median,
  paintBenchCases,
  type PaintBenchCase,
  type PaintBenchCaseResult,
  type PaintSample,
} from "@/screenshots/paint-bench-cases";

export interface PaintBenchReport {
  repeats: number;
  cases: PaintBenchCaseResult[];
  text: string;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Mounts the omnibar the way a cold Alt+F does: no cached snapshot, then wait
 * until the overlay is shown. The clock starts at that mount.
 */
async function measure(root: HTMLElement, item: PaintBenchCase): Promise<PaintSample> {
  render(null, root);
  await browser.storage.local.set({
    [DISPLAY_SETTINGS_STORAGE_KEY]: item.settings,
    [COMPLEXITY_SETUP_DONE_KEY]: true,
  });
  await nextFrame();

  return new Promise((resolve, reject) => {
    const started = performance.now();
    let contentMs: number | null = null;
    let settled = false;

    const finish = (openMs: number) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      const omnibar = document.querySelector("[data-omnibar]");
      resolve({
        contentMs: contentMs ?? openMs,
        openMs,
        rows: document.querySelectorAll("[data-testid='zen-search-item']").length,
        todoRows: document.querySelectorAll("[data-testid='zen-todo-row']").length,
        issueRows: document.querySelectorAll("[data-testid='zen-issue-entry']").length,
        statusButtons: document.querySelectorAll("[data-testid='zen-status-button']").length,
        statusBar: document.querySelector("[data-testid='zen-status-bar']") !== null,
        nodes: omnibar?.querySelectorAll("*").length ?? 0,
      });
    };

    const observer = new MutationObserver(() => {
      if (contentMs === null && document.querySelector("[data-testid='zen-search-item']")) {
        contentMs = performance.now() - started;
      }
      if (document.querySelector("[data-omnibar-stage='open']")) {
        observer.disconnect();
        requestAnimationFrame(() => finish(performance.now() - started));
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Omnibar did not open for ${item.id}`));
    }, 5000);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-omnibar-stage"],
    });

    render(<SearchApp onClose={() => undefined} layout="overlay" />, root);
  });
}

function summarize(item: PaintBenchCase, samples: PaintSample[]): PaintBenchCaseResult {
  const last = samples[samples.length - 1];
  if (!last) {
    throw new Error(`No samples for ${item.id}`);
  }
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    contentMs: median(samples.map((sample) => sample.contentMs)),
    openMs: median(samples.map((sample) => sample.openMs)),
    contentDeltaMs: 0,
    openDeltaMs: 0,
    rows: last.rows,
    todoRows: last.todoRows,
    issueRows: last.issueRows,
    statusButtons: last.statusButtons,
    statusBar: last.statusBar,
    nodes: last.nodes,
  };
}

export function startPaintBench(root: HTMLElement): void {
  window.__zenPaintBench = {
    async run({ repeats = 7 } = {}) {
      const cases = paintBenchCases();
      const first = cases[0];
      if (!first) {
        throw new Error("No paint bench cases.");
      }
      await measure(root, first);
      const results: PaintBenchCaseResult[] = [];
      for (const item of cases) {
        await measure(root, item);
        const samples: PaintSample[] = [];
        for (let index = 0; index < repeats; index += 1) {
          samples.push(await measure(root, item));
        }
        results.push(summarize(item, samples));
      }
      const baseline = results[0];
      if (!baseline) {
        throw new Error("No paint bench results.");
      }
      for (const result of results) {
        result.contentDeltaMs = result.contentMs - baseline.contentMs;
        result.openDeltaMs = result.openMs - baseline.openMs;
      }
      return {
        repeats,
        cases: results,
        text: formatPaintBenchReport(results, repeats),
      };
    },
  };
}

declare global {
  interface Window {
    __zenPaintBench?: {
      run(options?: { repeats?: number }): Promise<PaintBenchReport>;
    };
  }
}
