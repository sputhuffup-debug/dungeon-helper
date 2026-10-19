/**
 * Text measurement for map labels: the standard Helvetica and
 * Helvetica-Bold advance widths (AFM, 1/1000 em, WinAnsi code points).
 * Screen maps ask for "Helvetica, Arial, sans-serif", which resolve to
 * Helvetica-metric fonts (Arial, Liberation Sans) on most systems; the PDF
 * writer uses the PDF standard fonts with these same metrics. So one
 * measurement drives label placement on screen and in print.
 */

/** Font stack for every label the site map draws. */
export const MAP_FONT = "Helvetica, Arial, sans-serif";

// Advance widths for character codes 32..126.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278,
  500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
  556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278,
  556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333,
  611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Unicode characters outside ASCII that WinAnsi (cp1252) can encode, with their code and widths [regular, bold]. */
const WIN_ANSI_EXTRA: Record<string, [number, number, number]> = {
  "€": [0x80, 556, 556],
  "‚": [0x82, 222, 278],
  "„": [0x84, 333, 500],
  "…": [0x85, 1000, 1000],
  "†": [0x86, 556, 556],
  "‡": [0x87, 556, 556],
  "‰": [0x89, 1000, 1000],
  "‹": [0x8b, 333, 333],
  "‘": [0x91, 222, 278],
  "’": [0x92, 222, 278],
  "“": [0x93, 333, 500],
  "”": [0x94, 333, 500],
  "•": [0x95, 350, 350],
  "–": [0x96, 556, 556],
  "—": [0x97, 1000, 1000],
  "™": [0x99, 1000, 1000],
  "›": [0x9b, 333, 333],
  " ": [0xa0, 278, 278],
  "°": [0xb0, 400, 400],
  "±": [0xb1, 584, 584],
  "²": [0xb2, 333, 333],
  "³": [0xb3, 333, 333],
  "·": [0xb7, 278, 278],
  "¼": [0xbc, 834, 834],
  "½": [0xbd, 834, 834],
  "¾": [0xbe, 834, 834],
  "×": [0xd7, 584, 584],
  "÷": [0xf7, 584, 584],
};

/** Characters with no WinAnsi code, mapped to a close stand-in. */
const SUBSTITUTE: Record<string, string> = {
  "≈": "~", // ≈
  "−": "-", // minus
  "→": ">", // →
  "←": "<",
  "≤": "<=",
  "≥": ">=",
  "′": "'",
  "″": '"',
};

/** Advance width of one character in 1/1000 em. */
function charWidth(ch: string, bold: boolean): number {
  const c = ch.codePointAt(0) ?? 63;
  if (c >= 32 && c <= 126) return (bold ? BOLD : REGULAR)[c - 32]!;
  const extra = WIN_ANSI_EXTRA[ch];
  if (extra) return bold ? extra[2] : extra[1];
  const sub = SUBSTITUTE[ch];
  if (sub) return [...sub].reduce((s, x) => s + charWidth(x, bold), 0);
  // Latin-1 letters: about the width of their base letter
  if (c >= 0xc0 && c <= 0xff) return bold ? 667 : 611;
  return 556;
}

/** Width of `text` at `size` (same units as the size). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w / 1000) * size;
}

/** Shorten `text` with an ellipsis so it is at most `max` wide. */
export function ellipsize(text: string, size: number, max: number, bold = false): string {
  if (textWidth(text, size, bold) <= max) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(`${chars.join("").trimEnd()}…`, size, bold) > max) chars.pop();
  return chars.length <= 1 && textWidth(`${chars.join("")}…`, size, bold) > max ? "" : `${chars.join("").trimEnd()}…`;
}

/** Split `text` into at most `lines` lines no wider than `max` (word wrap; the last line is ellipsized). */
export function wrapText(text: string, size: number, max: number, lines: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]!;
    if (textWidth(next, size, bold) <= max || !cur) {
      cur = next;
      continue;
    }
    out.push(cur);
    cur = words[i]!;
    if (out.length === lines - 1) {
      cur = words.slice(i).join(" ");
      break;
    }
  }
  if (cur) out.push(cur);
  return out.slice(0, lines).map((l, i, a) => (i === a.length - 1 ? ellipsize(l, size, max, bold) : l));
}

/**
 * Encode text as WinAnsi bytes (cp1252), for the PDF standard fonts.
 * Characters it cannot encode become a stand-in or "?".
 */
export function winAnsiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 63;
    if (c >= 32 && c <= 126) out.push(c);
    else if (WIN_ANSI_EXTRA[ch]) out.push(WIN_ANSI_EXTRA[ch][0]);
    else if (SUBSTITUTE[ch]) out.push(...winAnsiBytes(SUBSTITUTE[ch]));
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (c === 9 || c === 10) out.push(32);
    else out.push(63);
  }
  return out;
}
