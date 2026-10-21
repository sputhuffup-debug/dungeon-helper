/**
 * Reserved Material. The ORC License does not cover a publisher's trademarks
 * or its setting: proper nouns such as deities, places, planes of its
 * cosmology, organizations, named characters, peoples and events. This list
 * names the ones that appear in the core books' text (found by scanning every
 * included entry for capitalized words that are not rules vocabulary, then
 * reviewed by hand) plus the major setting names around them.
 *
 * How each term is handled:
 * - an entry whose name contains a term is dropped;
 * - a term with `replace` is rewritten to a generic phrase (planes and the
 *   underground world, where the rules need a place);
 * - any other term removes the sentence (or list item) it appears in, which
 *   is how the books' setting asides ("deities such as ...") disappear while
 *   the rules around them stay.
 *
 * Everything removed or rewritten is counted in the conversion notes, and
 * the tests check that no term is left anywhere in the pack or the demo.
 */

export type ReservedKind = "deity" | "place" | "plane" | "organization" | "character" | "people" | "language" | "trademark" | "publication" | "event";

export interface ReservedTerm {
  /** The name as it appears in text (matched whole-word, case-sensitive). */
  term: string;
  kind: ReservedKind;
  /** A generic phrase that replaces the term (and a leading "the"); otherwise the sentence goes. */
  replace?: string;
}

const t = (kind: ReservedKind, ...terms: string[]): ReservedTerm[] => terms.map((term) => ({ term, kind }));
const r = (kind: ReservedKind, term: string, replace: string): ReservedTerm => ({ term, kind, replace });

export const RESERVED: ReservedTerm[] = [
  // Trademarks and other publications.
  ...t("trademark", "Pathfinder", "Paizo", "Lost Omens", "Starfinder", "PFS"),
  r("trademark", "Golarion", "the world"),
  ...t("publication", "Core Rulebook", "Bestiary", "Advanced Player's Guide", "Gamemastery Guide", "Secrets of Magic", "Guns & Gears", "Dark Archive", "Book of the Dead", "Treasure Vault", "Rage of Elements", "Howl of the Wild", "War of Immortals", "NPC Core", "Divine Mysteries"),
  // Deities, demigods, archfiends and their titles.
  ...t(
    "deity",
    "Abadar", "Achaekek", "Alseta", "Andoletta", "Angradd", "Arazni", "Areshkagal", "Arshea", "Ashava", "Asmodeus", "Asmodean", "Baalzebul", "Baphomet", "Barbatos", "Barzahk", "Belial", "Besmara", "Bolka", "Brigh",
    "Calistria", "Casandalee", "Cayden Cailean", "Caydenite", "Chaldira", "Cyth-V'sug", "Cyth-V’sug", "Dagon", "Dahak", "Daikitsu", "Deskari", "Desna", "Diomazul", "Dispater", "Dranngvit", "Droskar", "Eiseth", "Elucredassa", "Erastil", "Erecura",
    "Findeladlara", "Folgrit", "Fumeiyoshi", "Geryon", "Ghlaunder", "Gogunta", "Gorum", "Gozreh", "Gozren", "Grandmother Spider", "Groetus", "Grundinnar", "Gyronna", "Haagenti", "Hanspur", "Hei Feng", "Iomedae", "Iomedaean", "Irori",
    "Jaidi", "Jubilex", "Kazutal", "Ketephys", "Kols", "Kostchtchie", "Kugaptee", "Kurgess", "Lamashtu", "Lao Shu Po", "Lissala", "Mahathallah", "Mammon", "Mephistopheles", "Milani", "Moloch", "Naderi", "Nalinivati", "Nanbyo", "Nethys", "Nivi Rhombodazzle",
    "Nocticula", "Norgorber", "Pazuzu", "Pharasma", "Qi Zhong", "Ragathiel", "Ravithra", "Rovagug", "Sarenrae", "Shelyn", "Shizuru", "Sivanah", "Szuriel", "Tlehar", "Torag", "Trelmarixian", "Trudd", "Tsukiyo", "Urgathoa", "Vildeis",
    "Yaezhing", "Ydersius", "Ymeri", "Zon-Kuthon", "Zura", "Zyphus", "Magdh", "Supell", "Kwanlai", "Shuyookhs", "Apollyon", "Forgefather", "Dawnflower", "Lady of Graves", "First Vault", "Mantis God", "Outer Gods", "Great Old Ones", "Eldest",
    "Apocalypse Riders", "Apocalypse Rider", "Horseman", "Horsemen", "Charon", "Monad",
  ),
  // Named characters, families and named artifacts.
  ...t("character", "Treerazer", "Sorshen", "Kazavon", "Aroden", "Tar-Baphon", "Whispering Tyrant", "Karzoug", "Xanderghul", "Alaznist", "Belimarius", "Krune", "Zutha", "Runelord", "Runelords", "Thrune", "Serithtial", "Blackaxe", "Mullun", "Old Mother"),
  // Organizations and schools.
  ...t(
    "organization",
    "Pathfinder Society", "Arcanamirium", "Magaambya", "Farseer Tower", "Alabaster Academy", "Occularium", "Acadamae", "Sable Company", "Hellknight", "Hellknights", "Red Mantis", "Aspis Consortium", "Knights of Lastwall", "Whispering Way", "Bellflower Network",
    "Firebrands", "Lion Blades", "Gray Maidens", "Eagle Knights", "Dominion of the Black", "Dominion", "Witchmarket",
  ),
  // Places of the setting's world.
  ...t(
    "place",
    "Absalom", "Avistan", "Garund", "Tian Xia", "Casmaron", "Arcadia", "Iblydos", "Varisia", "Magnimar", "Korvosa", "Kintargo", "Cheliax", "Andoran", "Taldor", "Qadira", "Katapesh", "Osirion", "Thuvia", "Rahadoum", "Geb", "Nex", "Alkenstar",
    "Ustalav", "Nidal", "Molthune", "Nirmathas", "Lastwall", "Belkzen", "Irrisen", "Numeria", "Brevoy", "Mendev", "Sarkoris", "Worldwound", "Kyonin", "Fierani", "Tanglebriar", "Vudra", "Jalmeray", "Highhelm", "Nar-Voth", "Sekamina", "Orv",
    "Abendego", "Inner Sea", "Mana Wastes", "Sodden Lands", "Port Peril", "Hermea", "Druma", "Isger", "Galt", "Razmiran", "Thassilon", "Azlant", "Jistka", "Kalistrade", "Grungir", "Barrowsiege", "Blackpeak", "Mhar Massif", "Pale Mountain",
    "Sakalayo", "Five Kings Mountains", "Mwangi Expanse", "Blasted Tarn", "Stygia", "Avernus", "Malebolge", "Phlegethon", "Nessus", "Dis", "Aucturn", "Starstone", "Rifts",
  ),
  // Peoples and the setting's regional languages.
  ...t("people", "Varisian", "Chelaxian", "Taldan", "Osirian", "Thassilonian", "Azlanti", "Jistkan", "Garundi", "Keleshite", "Kellid", "Shoanti", "Ulfen", "Vudrani", "Jalmeri", "Mwangi", "Tian", "Nidalese", "Ustalavic", "Erutaki", "Varki"),
  ...t("language", "Osiriani", "Kelish", "Hallit", "Taldane", "Tien"),
  ...t("event", "Earthfall", "Bleaching", "Age of Lost Omens", "Convergence", "Skinsaw"),
  r("plane", "River of Souls", "the procession of souls"),
  // The setting's own cosmology: rewritten to generic planes, so the rules that need a place keep working.
  r("plane", "Outer Rifts", "the demonic realms"),
  r("plane", "Abaddon", "the daemonic wastes"),
  r("plane", "Boneyard", "the realm of the dead"),
  r("plane", "Maelstrom", "the plane of chaos"),
  r("plane", "Axis", "the plane of law"),
  r("plane", "Netherworld", "the shadow plane"),
  r("plane", "Creation's Forge", "the plane of creation"),
  r("plane", "Creation’s Forge", "the plane of creation"),
  r("plane", "Outer Sphere", "the outer planes"),
  r("plane", "Inner Sphere", "the inner planes"),
  r("plane", "First World", "the realm of the fey"),
  r("plane", "Dreamlands", "the realm of dreams"),
  r("plane", "Darklands", "the deep underground"),
  r("plane", "Universe", "the universe"),
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A whole-word, case-sensitive pattern for one term. */
export function termPattern(term: string, flags = "g"): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, `u${flags}`);
}

/** Every term that should never appear in the output, for the tests. */
export const RESERVED_TERMS: string[] = RESERVED.map((x) => x.term);

/** The first reserved term in `s`, if any. */
export function findReserved(s: string): ReservedTerm | undefined {
  return RESERVED.find((x) => termPattern(x.term, "").test(s));
}

export interface ScrubLog {
  /** term → number of sentences or list items removed */
  removed: Map<string, number>;
  /** term → number of rewrites */
  replaced: Map<string, number>;
  /** entries dropped for their name: "folder: name (term)" */
  dropped: string[];
}

export function newScrubLog(): ScrubLog {
  return { removed: new Map(), replaced: new Map(), dropped: [] };
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Split a paragraph into sentences, keeping the punctuation (and a closing quote or bracket). */
function sentences(p: string): string[] {
  return p.match(/[^.!?]+(?:[.!?]+["”’)\]]*|$)\s*/g) ?? [p];
}

function rewrite(text: string, log: ScrubLog): string {
  let s = text;
  for (const x of RESERVED) {
    if (!x.replace) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:([Tt])he )?${escape(x.term)}(['’]s)?(?![\\p{L}\\p{N}])`, "gu");
    s = s.replace(re, (_m, the: string | undefined, poss: string | undefined) => {
      bump(log.replaced, x.term);
      let out = x.replace!;
      if (the === "T") out = out[0]!.toUpperCase() + out.slice(1);
      if (poss) out += out.endsWith("s") ? "’" : "’s";
      return out;
    });
  }
  return s;
}

/**
 * Remove Reserved Material from Markdown text: rewrite the generic terms,
 * then drop every sentence, list item or table row that still names a term.
 */
export function scrub(md: string, log: ScrubLog): string {
  if (!md) return md;
  const text = rewrite(md, log);
  const removeTerms = RESERVED.filter((x) => !x.replace);
  const hit = (s: string) => removeTerms.find((x) => termPattern(x.term, "").test(s));
  const out: string[] = [];
  for (const para of text.split(/\n\n/)) {
    if (!hit(para)) {
      out.push(para);
      continue;
    }
    const lines = para.split("\n");
    let kept: string;
    if (lines.length > 1 || para.startsWith("- ") || para.startsWith("|")) {
      kept = lines
        .filter((l) => {
          const h = hit(l);
          if (h) bump(log.removed, h.term);
          return !h;
        })
        .join("\n");
    } else {
      // An all-italic paragraph keeps its italics around what is left.
      const italic = /^\*(?!\*)([\s\S]*[^*])\*$/.exec(para);
      kept = sentences(italic ? italic[1]! : para)
        .filter((s) => {
          const h = hit(s);
          if (h) bump(log.removed, h.term);
          return !h;
        })
        .join("")
        .trim();
      if (italic && kept) kept = `*${kept}*`;
    }
    kept = kept.trim();
    // Drop what is left when it is only a heading, a bold label or a table header.
    if (kept && !/^\*\*[^*]+\*\*:?$/.test(kept) && !/^\|[^\n]*\n\|[ -|]*$/.test(kept) && !/^#+ /.test(kept)) out.push(kept);
  }
  return out.filter((p) => p.trim().length > 0).join("\n\n");
}

/** Scrub a plain string field (a name list, a short note): rewrite, or drop it when a removable term remains. */
export function scrubLine(s: string, log: ScrubLog): string {
  const out = rewrite(s, log);
  const h = RESERVED.find((x) => !x.replace && termPattern(x.term, "").test(out));
  if (h) {
    bump(log.removed, h.term);
    return "";
  }
  return out;
}
