/* Entry point: app state, file input wiring and the analyse step that ties the modules together. */
import "./styles.css";
import { EXAMPLE } from "./example";
import type { EntryInfo } from "./engine";
import { encode, type Fingerprint } from "./fingerprint";
import type { LibraryManifest } from "./library";
import { pickMelody, skyline } from "./melody";
import { parseMidi, type Note, type ParsedMidi } from "./midi";
import { SearchClient } from "./search-client";
import { $, showErr } from "./ui/dom";
import { renderAnalysis, renderLibrary, renderTracks } from "./ui/panels";

/** Below this, a melody is too short to say anything useful. */
const MIN_NOTES = 6;

/** The search engine, running in a Web Worker. It holds the library; this page holds only what it shows. */
const search = new SearchClient();
/** Folder the built-in library is served from, as an absolute URL: the worker resolves relative
 * URLs against its own script's location, not the page's. */
const BASE = new URL(import.meta.env.BASE_URL, location.href).href;

/** What the library panel shows. Nothing here, or in the worker, leaves the browser. */
const lib: {
  manifest: LibraryManifest | null;
  privateIndex: { name: string; credit: string; count: number } | null;
  added: EntryInfo[];
} = { manifest: null, privateIndex: null, added: [] };

const showLibrary = () => renderLibrary({ ...lib, base: BASE });

const state: {
  notes: Note[];
  beatsPerBar: number;
  parsed: ParsedMidi | null;
  trackIndex: number;
  example: boolean;
  fileName: string;
} = { notes: EXAMPLE, beatsPerBar: 4, parsed: null, trackIndex: 0, example: true, fileName: "Example melody" };

/** Increases on every analysis, so a slow run that finishes late can tell it is out of date. */
let runId = 0;

/** Search in the worker; the page stays responsive meanwhile. Only the latest run is shown. */
async function analyze(): Promise<void> {
  const id = ++runId;
  const { notes, beatsPerBar, fileName, example } = state;
  $("summary").innerHTML = `<span class="pill faint">Checking…</span>`;
  try {
    const reply = await search.call("search", encode(notes));
    if (id === runId) renderAnalysis({ notes, beatsPerBar, fileName, example, reply });
  } catch (e) {
    if (id === runId) showErr("user-err", `Search failed: ${(e as Error).message}`);
  }
}

/* ---------- Input handling ---------- */

async function loadUser(file: File): Promise<void> {
  showErr("user-err", "");
  try {
    const parsed = parseMidi(await file.arrayBuffer());
    const idx = pickMelody(parsed);
    state.parsed = parsed; state.trackIndex = idx; state.beatsPerBar = parsed.beatsPerBar;
    state.notes = skyline(parsed.tracks[idx].notes); state.example = false; state.fileName = file.name;
    if (state.notes.length < MIN_NOTES) throw new Error("That track has too few notes to compare. Pick another track.");
    renderTracks(state.parsed, state.trackIndex);
    analyze();
  } catch (e) {
    showErr("user-err", `Could not read ${file.name}. ${(e as Error).message}`);
  }
}

async function loadRefs(files: File[]): Promise<void> {
  showErr("ref-err", "");
  const bad: string[] = [];
  const refs: { title: string; fp: Fingerprint }[] = [];
  for (const f of files) {
    try {
      const parsed = parseMidi(await f.arrayBuffer());
      const sky = skyline(parsed.tracks[pickMelody(parsed)].notes);
      if (sky.length < MIN_NOTES) throw new Error("too few notes");
      // Only the fingerprint is kept; the file's notes are discarded here.
      refs.push({ title: f.name.replace(/\.midi?$/i, ""), fp: encode(sky) });
    } catch {
      bad.push(f.name);
    }
  }
  if (bad.length) showErr("ref-err", `Skipped ${bad.length} file${bad.length > 1 ? "s" : ""} with no readable melody: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`);
  if (refs.length) lib.added.push(...(await search.call("addRefs", refs)));
  showLibrary();
  analyze();
}

/** Load a private index file (e.g. the Lakh index). It is read and indexed inside the worker. */
async function loadIndex(file: File): Promise<void> {
  showErr("ref-err", "");
  const pick = $<HTMLButtonElement>("index-pick");
  pick.disabled = true;
  $("index-status").textContent = `Reading ${file.name} and building its search index…`;
  try {
    const t0 = performance.now();
    const { name, credit, count } = await search.call("loadPrivate", file);
    lib.privateIndex = { name, credit, count };
    $("index-status").textContent = `Loaded ${count.toLocaleString("en-US")} songs in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    showLibrary();
    analyze();
  } catch (e) {
    $("index-status").textContent = "";
    showErr("ref-err", `Could not load ${file.name}. ${(e as Error).message}`);
  } finally {
    pick.disabled = false;
  }
}

function wireDrop(zoneId: string, onFiles: (files: File[]) => void): void {
  const z = $(zoneId);
  z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", (e) => {
    e.preventDefault();
    z.classList.remove("over");
    const fs = [...(e.dataTransfer?.files ?? [])];
    if (fs.length) onFiles(fs);
  });
}

$("user-pick").addEventListener("click", () => $("user-file").click());
$("ref-pick").addEventListener("click", () => $("ref-file").click());
$("index-pick").addEventListener("click", () => $("index-file").click());
$<HTMLInputElement>("index-file").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) loadIndex(input.files[0]);
  input.value = "";
});
$<HTMLInputElement>("user-file").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) loadUser(input.files[0]);
  input.value = "";
});
$<HTMLInputElement>("ref-file").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) loadRefs([...input.files]);
  input.value = "";
});
wireDrop("user-drop", (fs) => loadUser(fs[0]));
wireDrop("ref-drop", loadRefs);
$<HTMLSelectElement>("track-select").addEventListener("change", (e) => {
  if (!state.parsed) return;
  state.trackIndex = +(e.target as HTMLSelectElement).value;
  state.notes = skyline(state.parsed.tracks[state.trackIndex].notes);
  if (state.notes.length < MIN_NOTES) { showErr("user-err", "That track has too few notes to compare."); return; }
  showErr("user-err", "");
  analyze();
});

/* ---------- Start-up ---------- */

async function start(): Promise<void> {
  renderTracks(state.parsed, state.trackIndex);
  $("lib-count").textContent = "Loading…";
  try {
    lib.manifest = (await search.call("loadPd", BASE)).manifest;
  } catch (e) {
    showErr("ref-err", (e as Error).message);
  }
  showLibrary();
  analyze();
}

start();
