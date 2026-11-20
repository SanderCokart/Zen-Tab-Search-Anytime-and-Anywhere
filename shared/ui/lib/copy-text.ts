/** Puts `text` on the clipboard. Falls back to a hidden field if the Clipboard API is missing. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
}
