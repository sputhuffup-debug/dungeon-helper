/**
 * The built-in supplement "Remaster ORC books": which books it may take
 * entries from, how each is cited, and its ORC Attribution Notice lines.
 *
 * Only entries whose `system.publication` is `license: "ORC"`,
 * `remaster: true` and whose title is one of `ALLOWED_TITLES` (as the source
 * spells it, see `DATA_TITLES`) are read. Lost Omens titles, adventure paths,
 * society and player's guides, the Beginner Box and anything OGL never are.
 */
import { ORC_NOTICE, TRADEMARK_NOTICE } from "../authored/manifest.ts";

/** The supplement's id: every id it adds starts with it and a dot. */
export const SUPPLEMENT = "pf2e-orc-books";
export const SUPPLEMENT_NAME = "Remaster ORC books";
export const SUPPLEMENT_VERSION = "0.1.0";
/** The module versions it fits. */
export const EXTENDS = { module: "pf2e-orc", version: "^0.1.0" };

export interface Book {
  /** The book's title as allow-listed. */
  title: string;
  /** How entries cite it ("Pathfinder" left out, as the module cites its books). */
  cite: string;
  /** The Attribution Notice line: copied verbatim from the source's licence file when it has one. */
  attribution: string;
  /** Set when the source's licence file has no line for the book (or says "TBD"): the owner completes it. */
  todo?: string;
}

/** The allow-list, in the order the attribution lists the books. */
export const BOOKS: Book[] = [
  {
    title: "Pathfinder Monster Core 2",
    cite: "Monster Core 2",
    attribution: "Pathfinder Monster Core 2 © 2025, Paizo Inc.",
    todo: "no line in the source's licence file: add the designers and authors (and confirm the year) from the book's own ORC Attribution Notice",
  },
  {
    title: "Pathfinder NPC Core",
    cite: "NPC Core",
    attribution: "Pathfinder NPC Core © 2025, Paizo Inc.",
    todo: 'the source\'s licence file says "Authors: TBD": add the authors from the book\'s own ORC Attribution Notice',
  },
  {
    title: "Pathfinder Howl of the Wild",
    cite: "Howl of the Wild",
    attribution:
      'Pathfinder Howl of the Wild © 2023, Paizo Inc.; Authors: Kate Baker, Rigby Bendele, Chris Bissette, Jeremy Blum, Logan Bonner, Dan Cascone, James Case, Jessica Catalan, Brite Cheney, Rue Dickey, Caryn DiMarco, Matthew Fu, Leo Glass, Steven Hammond, Patrick Hurley, Michelle Y. Kim, Dustin Knight, Kendra Leigh Speedling, Christiana Lewis, Jessie "Aki" Lo, Luis Loza, Letterio Mammoliti, Jonathan "Ryomasa" Mendoza, Quinn Murphy, Dave Nelson, Mikhail Rekun, Kai Revius, Ember Rose, Simone D. Sallé, Michael Sayre, Shay Snow, Levi Steadman, Kyle Tam, Ruvaid Virk, and Andrew White.',
  },
  {
    title: "Pathfinder Rage of Elements",
    cite: "Rage of Elements",
    attribution:
      "Pathfinder Rage of Elements © 2023, Paizo Inc.; Authors: Logan Bonner, Jason Bulmahn, James Case, Jessica Catalan, Andrew D. Geels, Sen H.H.S., Patrick Hurley, Jason Keeley, Luis Loza, Mark Moreland, Jonathan Morgantini, AJ Neuro, Jessica Redekop, Solomon St. John, Michael Sayre, Mark Seifter, Shahreena Shahrani, Shay Snow, Levi Steadman, Mari Tokuda, Ruvaid Virk, Andrew White, and Linda Zayas-Palmer.",
  },
  {
    title: "Pathfinder Treasure Vault (Remastered)",
    cite: "Treasure Vault (Remastered)",
    attribution: "Pathfinder Treasure Vault (Remastered) © 2025, Paizo Inc.",
    todo: "no line in the source's licence file: add the authors (and confirm the year) from the book's own ORC Attribution Notice",
  },
  {
    title: "Pathfinder Battlecry!",
    cite: "Battlecry!",
    attribution: "Pathfinder Battlecry! © 2025, Paizo Inc.",
    todo: "no line in the source's licence file: add the authors (and confirm the year) from the book's own ORC Attribution Notice",
  },
  {
    title: "Pathfinder Impossible Magic",
    cite: "Impossible Magic",
    attribution: "Pathfinder Impossible Magic © 2025, Paizo Inc.",
    todo: "no line in the source's licence file: add the authors (and confirm the year) from the book's own ORC Attribution Notice",
  },
  {
    title: "Pathfinder Guns & Gears (Remastered)",
    cite: "Guns & Gears (Remastered)",
    attribution: "Pathfinder Guns & Gears Remastered © 2025, Paizo Inc.",
    todo: 'the source\'s licence file says "Authors: TBD": add the authors from the book\'s own ORC Attribution Notice',
  },
  {
    title: "Pathfinder Dark Archive (Remastered)",
    cite: "Dark Archive (Remastered)",
    attribution: "Pathfinder Dark Archive (Remastered) © 2025, Paizo Inc.",
    todo: "no line in the source's licence file: add the authors (and confirm the year) from the book's own ORC Attribution Notice",
  },
  {
    title: "Pathfinder War of Immortals",
    cite: "War of Immortals",
    attribution:
      "Pathfinder War of Immortals © 2024 Paizo Inc., Authors: James Case, Liane Merciel, and Michael Sayre. Additional writing by Jessica Catalan, Matt Chapmond, Steven Hammond, Steven T. Helt, Brent Holtsberry, Jason Keeley, Michelle Y. Kim, Luis Loza, Erik Mona, AJ Neuro, Joaquin Kyle “Makapatag” Saavedra, Tony Saunders, Andrew Stoeckle, Greg A. Vaughan, and Ruvaid Virk.",
  },
];

export const ALLOWED_TITLES = BOOKS.map((b) => b.title);

/**
 * How the source spells each allow-listed title. The source has no
 * "(Remastered)" title for Guns & Gears: its remastered entries are titled
 * "Pathfinder Guns & Gears" and marked `remaster: true` (the original book's
 * entries are OGL and `remaster: false`), so that title, ORC and remastered,
 * is the remastered book. Titles are compared trimmed (one Treasure Vault
 * entry has a leading space).
 */
export const DATA_TITLES: Record<string, string> = {
  ...Object.fromEntries(BOOKS.map((b) => [b.title, b.cite])),
  "Pathfinder Guns & Gears": "Guns & Gears (Remastered)",
};

/** Titles near an allow-listed one that are not on the list (logged, never read): the original, non-remastered titles. */
export const NEAR_TITLES = ["Pathfinder Treasure Vault", "Pathfinder Dark Archive", "Pathfinder Adventures: Dark Archive Web Supplement: In Darkness (Remastered)"];

/** Books left out entirely, with the reason (filled in by the converter's census: a book with no ORC, remastered entry). */
export const BOOK_BY_CITE = new Map(BOOKS.map((b) => [b.cite, b]));

export function attributionText(included: Book[]): string {
  return [
    `ORC Notice: ${ORC_NOTICE}`,
    `Attribution Notice: this supplement includes material from:\n${included.map((b) => b.attribution).join("\n")}`,
    "Reserved Material: none of the publishers' Reserved Material (trademarks, and setting names such as deities, places, organizations and characters) is used. The converted rules text and statistics are Licensed Material under the ORC License. The JSON structure of the data is derived from the Foundry VTT pf2e system (Apache License 2.0; see the module's NOTICE).",
    TRADEMARK_NOTICE,
  ].join("\n\n");
}
