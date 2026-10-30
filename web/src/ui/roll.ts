/* Piano roll drawn as SVG: time runs left to right, pitch bottom to top. */
import type { Note } from "../midi";
import { el } from "./dom";

export type RollNote = Note & { /** Draw in the highlight colour. */ hi?: boolean };

export interface RollLayer {
  notes: RollNote[];
  color: string;
  /** Draw outlined boxes instead of filled ones, so a second melody can sit on top of the first. */
  outline?: boolean;
}

export interface RollOptions {
  width?: number;
  height?: number;
  /** Beats per bar; draws bar lines when set. */
  bars?: number;
  /** Time ranges (in beats) to shade behind the notes. */
  spans?: { a: number; b: number }[];
}

export function drawRoll(svg: SVGElement, layers: RollLayer[], opts: RollOptions = {}): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const all = layers.flatMap((l) => l.notes);
  if (!all.length) return;
  const W = opts.width || 600, H = opts.height || 120, pad = 8;
  const t0 = Math.min(...all.map((n) => n.start)), t1 = Math.max(...all.map((n) => n.start + n.dur));
  const p0 = Math.min(...all.map((n) => n.pitch)) - 1, p1 = Math.max(...all.map((n) => n.pitch)) + 1;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (t: number) => pad + ((t - t0) / Math.max(1e-6, t1 - t0)) * (W - pad * 2);
  const rowH = (H - pad * 2) / (p1 - p0 + 1);
  const y = (p: number) => pad + (p1 - p) * rowH;
  if (opts.bars) {
    for (let b = Math.ceil(t0 / opts.bars) * opts.bars; b <= t1; b += opts.bars)
      el("line", { x1: x(b), x2: x(b), y1: pad, y2: H - pad, stroke: "var(--line)", "stroke-width": 1 }, svg);
  }
  for (const r of opts.spans || [])
    el("rect", { x: x(r.a), y: pad - 4, width: Math.max(2, x(r.b) - x(r.a)), height: H - pad * 2 + 8, fill: "var(--match-soft)", rx: 3 }, svg);
  for (const l of layers) for (const n of l.notes) {
    el("rect", {
      x: x(n.start), y: y(n.pitch) + rowH * 0.12, width: Math.max(2, x(n.start + n.dur) - x(n.start) - 1.5), height: Math.max(2, rowH * 0.76), rx: 1.5,
      fill: l.outline ? "none" : (n.hi ? "var(--match)" : l.color), stroke: l.outline ? l.color : "none", "stroke-width": l.outline ? 1.5 : 0,
    }, svg);
  }
}
