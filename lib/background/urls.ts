export function isContentScriptInjectableUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

export function isExtensionPageUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return url.startsWith("moz-extension:") || url.startsWith("chrome-extension:");
}
