export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findConversationRoot(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export interface ExtractBodyOptions {
  stripSelectors?: string;
  includeQuoted?: boolean;
  includeSignature?: boolean;
}

export function extractBody(
  bodyRoot: Element | null,
  options: ExtractBodyOptions = {},
): string {
  if (!bodyRoot) return "";

  const clone = bodyRoot.cloneNode(true) as Element;

  if (options.stripSelectors) {
    clone.querySelectorAll(options.stripSelectors).forEach((node) => node.remove());
  }

  if (!options.includeQuoted) {
    clone
      .querySelectorAll(
        ".gmail_quote, .gmail_quote_container, blockquote.gmail_quote, .quoted-content-width-limit, [data-test-id='enable-disable-quoted-btn']",
      )
      .forEach((node) => node.remove());
  }

  if (!options.includeSignature) {
    clone
      .querySelectorAll(".gmail_signature, .ticket-details-table-wrapper")
      .forEach((node) => node.remove());
  }

  return (clone.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function dedupeByContainment(elements: Element[]): Element[] {
  return elements.filter(
    (el, _i, arr) => !arr.some((other) => other !== el && other.contains(el)),
  );
}
