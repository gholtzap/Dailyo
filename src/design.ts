import type { DesignToken } from "./design-token-names.js";

/** Resolve the same contextual tokens used by CSS, including embedded games. */
export function designValue(
  name: DesignToken,
  element: Element = document.documentElement,
): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  if (!value) throw new Error(`Missing design token ${name}`);
  return value;
}
