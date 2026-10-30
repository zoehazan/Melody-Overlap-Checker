/* The 13 public domain melodies from the original prototype, as note text.
 * All are traditional or published long before 1930 (see LICENSES.md).
 * Phase 2 replaces this hand-made seed with converters for published public domain collections.
 */
export const SEED_SOURCE = "Prototype seed set (public domain, hand-entered)";

export const SEED_MELODIES: [title: string, credit: string, notes: string][] = [
  ["Twinkle, Twinkle, Little Star", "Traditional", "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2"],
  ["Ode to Joy", "Beethoven, 1824", "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2 D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2"],
  ["Frère Jacques", "Traditional", "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2"],
  ["Mary Had a Little Lamb", "Traditional", "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4"],
  ["Amazing Grace", "Traditional, 1835 tune", "D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 G4:2 E4 D4:2 D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 D5:3 B4 D5:1.5 B4:0.5 D5:0.5 B4:0.5 G4:2 D4 E4:1.5 G4:0.5 G4:0.5 E4:0.5 D4:2 D4 G4:2 B4:0.5 G4:0.5 B4:2 A4 G4:3"],
  ["Jingle Bells", "Pierpont, 1857", "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2"],
  ["Yankee Doodle", "Traditional", "C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4:2 B3:2 C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4:2 C4:2"],
  ["Brahms' Lullaby", "Brahms, 1868", "E4:0.5 E4:0.5 G4:2 E4:0.5 E4:0.5 G4:2 E4:0.5 G4:0.5 C5 B4:1.5 A4:0.5 A4 G4 D4:0.5 E4:0.5 F4 D4 D4:0.5 E4:0.5 F4:2 D4:0.5 F4:0.5 B4:0.5 A4:0.5 G4 B4 C5:2"],
  ["Auld Lang Syne", "Traditional", "G3 C4:1.5 C4:0.5 C4 E4 D4:1.5 C4:0.5 D4 E4:0.5 D4:0.5 C4:1.5 C4:0.5 E4 G4 A4:3 A4 G4:1.5 E4:0.5 E4 C4 D4:1.5 C4:0.5 D4 E4:0.5 D4:0.5 C4:1.5 A3:0.5 A3 G3 C4:3"],
  ["Oh! Susanna", "Foster, 1848", "C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 C4 D4:3 C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 D4 C4:3"],
  ["When the Saints Go Marching In", "Traditional", "C4 E4 F4 G4:4 C4 E4 F4 G4:4 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:3 E4 E4 D4 C4:3 C4 E4 G4 G4:2 F4:3 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4"],
  ["Greensleeves", "Traditional", "A4:0.5 C5 D5:0.5 E5:0.75 F5:0.25 E5:0.5 D5 B4:0.5 G4:0.75 A4:0.25 B4:0.5 C5 A4:0.5 A4:0.75 G#4:0.25 A4:0.5 B4 G#4:0.5 E4 A4:0.5 C5 D5:0.5 E5:0.75 F5:0.25 E5:0.5 D5 B4:0.5 G4:0.75 A4:0.25 B4:0.5 C5:0.75 B4:0.25 A4:0.5 G#4:0.75 F#4:0.25 G#4:0.5 A4:1.5"],
  ["Happy Birthday to You", "Hill sisters, public domain", "G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2 G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:2"],
];
