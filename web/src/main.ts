/* Entry point: app state, file input wiring and the analyse step that ties the modules together. */
import "./styles.css";
import { EXAMPLE } from "./example";
import { encode } from "./fingerprint";
import { loadPdLibrary, type LibraryEntry } from "./library";
import { pickMelody, skyline } from "./melody";
import { parseMidi, type Note, type ParsedMidi } from "./midi";
import { searchLibrary } from "./search";
import { $, showErr } from "./ui/dom";
import { renderAnalysis, renderLibrary, renderTracks } from "./ui/panels";

/** Below this, a melody is too short to say anything useful. */
const MIN_NOTES = 6;

/** Built-in entries first, then reference files added in this tab. Nothing here leaves the browser. */
const library: LibraryEntry[] = [];

const state: {
  notes: Note[];
  beatsPerBar: number;
  parsed: ParsedMidi | null;
  trackIndex: number;
  example: boolean;
  fileName: string;
} = { notes: EXAMPLE, beatsPerBar: 4, parsed: null, trackIndex: 0, example: true, fileName: "Example melody" };

function analyze(): void {
  renderAnalysis({
    notes: state.notes,
    beatsPerBar: state.beatsPerBar,
    fileName: state.fileName,
    example: state.example,
    librarySize: library.length,
    hits: searchLibrary(encode(state.notes), library),
  });
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
  for (const f of files) {
    try {
      const parsed = parseMidi(await f.arrayBuffer());
      const sky = skyline(parsed.tracks[pickMelody(parsed)].notes);
      if (sky.length < MIN_NOTES) throw new Error("too few notes");
      // Only the fingerprint is kept; the file's notes are discarded here.
      library.push({ title: f.name.replace(/\.midi?$/i, ""), credit: "Added by you", builtin: false, fp: encode(sky) });
    } catch {
      bad.push(f.name);
    }
  }
  if (bad.length) showErr("ref-err", `Skipped ${bad.length} file${bad.length > 1 ? "s" : ""} with no readable melody: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`);
  renderLibrary(library);
  analyze();
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
    library.unshift(...(await loadPdLibrary(`${import.meta.env.BASE_URL}pd-library.json`)));
  } catch (e) {
    showErr("ref-err", (e as Error).message);
  }
  renderLibrary(library);
  analyze();
}

start();
