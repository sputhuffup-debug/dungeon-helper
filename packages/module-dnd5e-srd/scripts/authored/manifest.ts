/** The pack's manifest and dice: the SRD 5.1 licence and attribution, play modes, the d20 engine. */
import type { D20EngineConfig, PackManifest } from "@campaign-forge/module-sdk";
import { PACK } from "../ids.ts";

/** The attribution CC-BY-4.0 asks for, exactly as the SRD 5.1 legal information gives it. */
export const SRD_ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export const VERSION = "0.1.0";

export const MODES = [
  { id: "campaign", name: "Campaign", description: "Long-running play: characters level up over many sessions, with factions, quests and a living world between adventures." },
  { id: "one-shot", name: "One-shot", description: "A single session: ready-made characters, one adventure in three acts, and a clear ending tonight." },
];

export const manifest: PackManifest = {
  id: PACK,
  version: VERSION,
  name: "5th Edition SRD 5.1 (fantasy d20)",
  ruleset: "SRD 5.1",
  edition: "System Reference Document 5.1",
  publisher: "Wizards of the Coast LLC (SRD 5.1, CC-BY-4.0)",
  authors: ["Campaign Forge contributors (conversion and GM tools)"],
  licenseNotice:
    "SRD 5.1 content under CC-BY-4.0 (see attribution). JSON structure derived from 5e-bits/5e-database (MIT). Tables, generators, templates and play advice marked Original were written for Campaign Forge. Compatible with fifth edition rules; not affiliated with or endorsed by Wizards of the Coast.",
  requiredCore: "0.1.0",
  modes: MODES,
  defaultMode: "campaign",
  dataStatus: "partially-verified",
  sourceBook: { title: "System Reference Document 5.1", pageNote: "Cited by SRD section; the SRD's own text is used as written.", url: "https://dnd.wizards.com/resources/systems-reference-document" },
  citationStyle: "section",
  license: {
    spdx: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: SRD_ATTRIBUTION,
  },
};

/**
 * d20 + ability modifier + proficiency bonus × proficiency (0, 1 or 2 for
 * expertise; saves 0 or 1) + the sheet's flat bonus for that skill or save.
 * Advantage, disadvantage and a DC come from the roll panel.
 */
export const dice: D20EngineConfig = {
  engine: "d20",
  abilityModifier: true,
  proficiency: { var: ["computed.proficiencyBonus", 0] },
  bonus: { var: [{ cat: ["fields.bonuses.", { var: ["skillId", "none"] }] }, 0] },
  critOn: 20,
  fumbleOn: 1,
  freeDice: [4, 6, 8, 10, 12, 100],
  labels: { success: "Success", failure: "Failure" },
};
