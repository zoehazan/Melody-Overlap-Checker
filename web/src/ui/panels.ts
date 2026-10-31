/* Rendering for the three panels: your melody, the reference library and the results. */
import type { Alignment } from "../align";
import type { LibraryEntry, LibraryManifest } from "../library";
import type { Note, ParsedMidi } from "../midi";
import type { Hit } from "../search";
import { $, el, esc } from "./dom";
import { drawRoll } from "./roll";

const fmt = (n: number) => n.toLocaleString("en-US");
const link = (text: string, url: string | null | undefined) =>
  url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);

/**
 * The library panel: built-in sources with their size, license and credit (as each source's
 * terms require), then a chip per file added in this tab.
 * `base` is the folder that pd-library.json was loaded from, for the credits link.
 */
export function renderLibrary(library: LibraryEntry[], manifest: LibraryManifest | null, base: string): void {
  const list = $("lib-sources");
  list.innerHTML = "";
  for (const s of manifest?.sources ?? []) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${link(s.name, s.url)}</span><span class="meta">${fmt(s.count)} · ${link(s.license, s.licenseUrl)}</span>`;
    li.title = s.description;
    list.appendChild(li);
  }
  if (manifest) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="meta">${link("Credits for every built-in melody", base + manifest.credits)}</span>`;
    list.appendChild(li);
  }

  const chips = $("lib-chips");
  chips.innerHTML = "";
  for (const l of library.filter((x) => !x.builtin)) {
    const c = document.createElement("span");
    c.className = "chip user";
    c.textContent = l.title;
    c.title = l.credit;
    chips.appendChild(c);
  }
  const added = library.filter((l) => !l.builtin).length;
  $("lib-count").textContent = `${fmt(library.length)} melodies` + (added ? ` · ${added} added` : "");
}

/** The track dropdown. With no parsed file, shows the built-in example as a single fixed option. */
export function renderTracks(parsed: ParsedMidi | null, trackIndex: number): void {
  const sel = $<HTMLSelectElement>("track-select");
  sel.innerHTML = "";
  if (!parsed) {
    sel.appendChild(new Option("Example melody (single line)", "0"));
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  parsed.tracks.forEach((t, i) => sel.appendChild(new Option(`${t.name} · ${t.notes.length} notes`, String(i))));
  sel.value = String(trackIndex);
}

/**
 * Rebuild the reference passage from its fingerprint, transposed to start on your note and laid
 * on your note timings so pitches compare directly. The library has no notes, only intervals,
 * so this is the only way to draw it, and it shows exactly what the matcher compared.
 */
export function rebuildRef(lib: LibraryEntry, r: Alignment, userNotes: Note[]): Note[] {
  let pitch = userNotes[r.uStart].pitch;
  const out: Note[] = [];
  const count = r.rEnd - r.rStart + 1;
  for (let k = 0; k < count; k++) {
    const u = userNotes[Math.min(r.uStart + k, userNotes.length - 1)];
    out.push({ pitch, start: u.start, dur: u.dur });
    if (k < count - 1) pitch += lib.fp.iv[r.rStart + k];
  }
  return out;
}

export interface AnalysisView {
  notes: Note[];
  beatsPerBar: number;
  fileName: string;
  example: boolean;
  librarySize: number;
  hits: Hit[];
}

export function renderAnalysis(v: AnalysisView): void {
  const { notes, hits } = v;
  const bars = (beat: number) => Math.floor(beat / v.beatsPerBar) + 1;
  $("example-flag").hidden = !v.example;
  $("user-meta").textContent = `${v.fileName} · ${notes.length} notes · ${bars(notes[notes.length - 1].start)} bars`;

  const strong = hits.filter((x) => x.level === 2), listen = hits.filter((x) => x.level === 1), faint = hits.filter((x) => x.level === 0);
  $("summary").innerHTML =
    `<span class="pill strong">${strong.length} close</span><span class="pill listen">${listen.length} worth a listen</span><span class="pill faint">${faint.length} passing</span>`;

  const flagged = [...strong, ...listen];
  const spans = flagged.map((x) => ({ a: notes[x.r.uStart].start, b: notes[x.r.uEnd].start + notes[x.r.uEnd].dur }));
  const hiSet = new Set<number>();
  for (const x of flagged) for (let k = x.r.uStart; k <= x.r.uEnd; k++) hiSet.add(k);
  drawRoll($<SVGSVGElement>("overview"),
    [{ notes: notes.map((n, k) => ({ ...n, hi: hiSet.has(k) })), color: "var(--accent)" }],
    { spans, bars: v.beatsPerBar, height: 130 });

  const box = $("results");
  box.innerHTML = "";
  if (!flagged.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = `No close or notable resemblances against the ${fmt(v.librarySize)} melodies in the library. That only covers this library, so also hum the hook into Google's "Hum to Search" or SoundHound for a much wider check.`;
    box.appendChild(p);
  }
  for (const x of flagged.slice(0, 8)) box.appendChild(renderMatch(x, notes, bars));
  if (faint.length) {
    const det = document.createElement("details");
    det.innerHTML = `<summary>${faint.length} passing resemblance${faint.length > 1 ? "s" : ""}, likely common patterns</summary>` +
      `<ul class="faint-list">${faint.slice(0, 30).map((x) => `<li>${esc(x.lib.title)}: ${x.r.exact + 1} notes around bar ${bars(notes[x.r.uStart].start)}</li>`).join("")}</ul>`;
    box.appendChild(det);
  }
}

/** Per-melody credit line, for sources whose license asks for one (e.g. CC BY editions). */
function attribution(lib: LibraryEntry): string {
  return lib.attribution ? `<div class="meta">${link(lib.attribution.text, lib.attribution.url)}</div>` : "";
}

function renderMatch(x: Hit, n: Note[], bars: (beat: number) => number): HTMLElement {
  const r = x.r;
  const div = document.createElement("article");
  div.className = "match";
  const label = x.level === 2 ? '<span class="pill strong">Close match</span>' : '<span class="pill listen">Worth a listen</span>';
  div.innerHTML = `
      <div class="match-head"><div><h3>${esc(x.lib.title)}</h3><div class="meta">${esc(x.lib.credit)}</div>${attribution(x.lib)}</div>${label}</div>
      <div class="stats">
        <div class="stat"><b>Bars ${bars(n[r.uStart].start)}–${bars(n[r.uEnd].start)}</b><span>in your melody</span></div>
        <div class="stat"><b>${r.exact + 1} notes</b><span>matching run</span></div>
        <div class="stat"><b>${Math.round(r.identity * 100)}%</b><span>intervals identical</span></div>
        <div class="stat"><b>${Math.round(r.rhythm * 100)}%</b><span>rhythm agrees</span></div>
      </div>`;
  const rb = document.createElement("div");
  rb.className = "roll-box";
  const svg = el("svg", { class: "roll", role: "img", "aria-label": `Your passage compared with ${x.lib.title}` });
  rb.appendChild(svg);
  div.appendChild(rb);
  drawRoll(svg, [
    { notes: n.slice(r.uStart, r.uEnd + 1), color: "var(--accent)" },
    { notes: rebuildRef(x.lib, r, n), color: "var(--match)", outline: true },
  ], { height: 110 });
  const leg = document.createElement("div");
  leg.className = "legend";
  leg.innerHTML = `<span><i class="sw" style="background:var(--accent)"></i>Your passage</span><span><i class="sw" style="border:1.5px solid var(--match)"></i>${esc(x.lib.title)}, moved to your key and lined up note by note</span>`;
  div.appendChild(leg);
  if (x.stepwise) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = "This stretch moves only by steps, which is common in many songs, so it was rated one level lower.";
    div.appendChild(p);
  }
  return div;
}
