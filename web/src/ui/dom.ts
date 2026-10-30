/* Small DOM helpers shared by the UI modules. */

export const $ = <T extends Element = HTMLElement>(id: string): T => document.querySelector<T>(`#${id}`)!;

const SVGNS = "http://www.w3.org/2000/svg";

/** Create an SVG element with attributes, optionally appending it to a parent. */
export function el(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

/** Escape text for use inside innerHTML. Titles of user-added files go through here. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function showErr(id: string, msg?: string): void {
  const e = $(id);
  e.textContent = msg || "";
  e.hidden = !msg;
}
