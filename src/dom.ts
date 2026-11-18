export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
type Selected<S extends string> = S extends '#city-map' ? SVGSVGElement :
  S extends '#difficulty' ? HTMLSelectElement :
  S extends '#feed-copy-text' | '#rush-copy-text' ? HTMLTextAreaElement : HTMLElement;
export function required<S extends string>(selector: S): Selected<S> {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node as Selected<S>;
}
export function recordValue<T>(record: Record<string, T>, key: string): T | undefined { return record[key]; }
