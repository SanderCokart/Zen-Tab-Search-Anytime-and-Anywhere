const TOKEN_BYTES = 32;

/** 256 random bits as hex: long enough that guessing it over loopback is hopeless. */
export function generateBridgeToken(
  getRandomValues: (array: Uint8Array) => Uint8Array = (array) => crypto.getRandomValues(array),
): string {
  const bytes = getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeBridgeToken(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
