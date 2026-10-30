import { seqFromText } from "./fingerprint";

/* Example "your song": original material in A major with Ode to Joy's opening contour borrowed mid-phrase in a new rhythm. */
export const EXAMPLE = seqFromText(
  "A4 E5:1.5 D5:0.5 C#5 B4 A4:2 F#4 G#4 A4:2 " +
  "C#5:0.5 C#5:0.5 D5:0.5 E5:0.5 E5 D5:0.5 C#5:0.5 B4 A4:0.5 A4:0.5 B4:0.5 C#5:0.5 C#5:1.5 B4:0.5 B4:2 " +
  "E5 F#5 E5 C#5 A4:2 B4 C#5 A4:4"
);
