/** The pack's manifest and dice: the ORC License notice and attribution, play modes, the d20 engine read as four degrees. */
import type { D20EngineConfig, PackManifest } from "@campaign-forge/module-sdk";
import { PACK } from "../ids.ts";
import { ifs, add, mul, gt, v } from "./logic.ts";

/** Section 1 of the ORC License notice, as the source's licence file gives it. */
export const ORC_NOTICE =
  "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations. All warranties are disclaimed as set forth therein.";

/** The Attribution Notice lines for the books this module uses, copied from the source's licence file. */
export const ATTRIBUTION_LINES = [
  "Pathfinder Player Core © 2023, Paizo Inc.; Designers: Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter. Authors: Alexander Augunas, Kate Baker, Logan Bonner, Jason Bulmahn, Carlos Cabrera, Calder CaDavid, James Case, Eleanor Ferron, Steven Hammond, Joan Hong, Vanessa Hoskins, James Jacobs, Jenny Jarzabski, Erik Keith, Dustin Knight, Lyz Liddell, Luis Loza, Patchen Mortimer, Dennis Muldoon, Stephen Radney-MacFarland, Mikhail Rekun, David N. Ross, Michael Sayre, Mark Seifter, Kendra Leigh, Speedling, Mark Thompson, Clark Valentine, Andrew White, Landon Winkler, and Linda Zayas-Palmer",
  "Pathfinder GM Core © 2023, Paizo Inc.; Designers: Logan Bonner and Mark Seifter. Authors: Amirali Attar Olyaee, Logan Bonner, Creighton Broadhurst, Jason Bulmahn, James Case, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Jaym Gates, Matthew Goetz, James Jacobs, Brian R. James, Jenny Jarzabski, Dustin Knight, Jason LeMaitre, Lyz Liddell, Luis Loza, Ron Lundeen, Stephen Radney-MacFarland, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Amber Stewart, Clark Valentine, Landon Winkler, and Linda Zayas-Palmer",
  "Pathfinder Player Core 2 © 2024, Paizo Inc.; Authors: Amirali Attar Olyaee, Alexander Augunas, Brian Bauman, Joshua Birdsong, Logan Bonner, Jason Bulmahn, James Case, Jessica Catalan, John Compton, Paris Crenshaw, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Steven Hammond, Sasha Laranoa Harving, Joan Hong, Nicolas Hornyak, Vanessa Hoskins, James Jacobs, Jason Keeley, Dustin Knight, Avi Kool, Lyz Liddell, Nicolas Logue, Luis Loza, Ron Lundeen, Patchen Mortimer, Stephen Radney‑MacFarland, Jessica Redekop, Mikhail Rekun, Alex Riggs, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Jason Tondro, Clark Valentine, Andrew White, Landon Winkler, and Tonya Woldridge.",
  "Pathfinder Monster Core © 2024, Paizo Inc.",
];

export const TRADEMARK_NOTICE = "Compatible with Pathfinder Second Edition (Remaster). Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.";

export const ATTRIBUTION = [
  `ORC Notice: ${ORC_NOTICE}`,
  `Attribution Notice: this module includes material from:\n${ATTRIBUTION_LINES.join("\n")}`,
  "Reserved Material: none of the publishers' Reserved Material (trademarks, and setting names such as deities, places, organizations and characters) is used. The converted rules text and statistics are Licensed Material under the ORC License. The JSON structure of the data is derived from the Foundry VTT pf2e system (Apache License 2.0; see the module's NOTICE).",
  TRADEMARK_NOTICE,
].join("\n\n");

export const VERSION = "0.1.0";

export const MODES = [
  { id: "campaign", name: "Campaign", description: "Long-running play: characters gain levels, feats and gear over many sessions, with factions, quests and a living world between adventures." },
  { id: "one-shot", name: "One-shot", description: "A single session: ready-made characters, one adventure in three acts, and a clear ending tonight." },
];

export const NAME = "Fantasy d20 Remaster (ORC)";

export const manifest: PackManifest = {
  id: PACK,
  version: VERSION,
  name: NAME,
  ruleset: "ORC core rules (second edition remaster)",
  edition: "Player Core, Player Core 2, GM Core, Monster Core (ORC content only)",
  publisher: "ORC-licensed content by Paizo Inc. (see attribution)",
  authors: ["Campaign Forge contributors (conversion and GM tools)"],
  licenseNotice: `ORC-licensed rules content (see attribution); JSON structure derived from the Foundry VTT pf2e system (Apache-2.0). Tables, generators, templates and play advice marked Original were written for Campaign Forge. ${TRADEMARK_NOTICE}`,
  requiredCore: "0.1.0",
  modes: MODES,
  defaultMode: "campaign",
  dataStatus: "partially-verified",
  sourceBook: { title: "Player Core, Player Core 2, GM Core, Monster Core (ORC License content)", pageNote: "Cited by book and section; ORC content is used as written, without Reserved Material.", url: "https://paizo.com/orclicense" },
  citationStyle: "section",
  license: {
    spdx: "LicenseRef-ORC",
    name: "ORC License",
    url: "https://paizo.com/orclicense",
    attribution: ATTRIBUTION,
  },
};

/** The multiple attack penalty as a roll panel choice: −5 / −10, or −4 / −8 with an agile weapon. */
export const MAP_CHOICES = [
  { label: "1st attack", value: 0 },
  { label: "2nd attack (−5)", value: -5 },
  { label: "3rd attack (−10)", value: -10 },
  { label: "2nd attack, agile (−4)", value: -4 },
  { label: "3rd attack, agile (−8)", value: -8 },
];

/**
 * d20 + attribute modifier (written down, not a score) + proficiency by rank
 * (level + 2/4/6/8 when trained or better) + the sheet's flat bonus for that
 * check. A stat block (creature or hazard) writes its totals down instead:
 * its "skill" value is the whole modifier. Four degrees: DC + 10 and DC − 10
 * mark the criticals; a natural 20 or 1 moves the result one step.
 */
export const dice: D20EngineConfig = {
  engine: "d20",
  abilityModifier: false,
  proficiencyMode: "add",
  proficiency: ifs(v("computed.statBlock", false), 0, gt(v("skill", 0), 0), add(v("fields.level", 1), mul(2, v("skill", 0))), 0),
  bonus: ifs(v("computed.statBlock", false), v("skill", 0), v({ cat: ["fields.bonuses.", { var: ["skillId", "none"] }] }, 0)),
  critOn: 20,
  fumbleOn: 1,
  critMargin: 10,
  naturalShift: true,
  advantageNames: { normal: "normal", advantage: "fortune", disadvantage: "misfortune" },
  modifierChoices: [{ id: "map", title: "Attack", choices: MAP_CHOICES }],
  freeDice: [4, 6, 8, 10, 12, 100],
  labels: { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure" },
};
