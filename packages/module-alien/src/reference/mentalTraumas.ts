import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

export interface MentalTraumaItem extends ReferenceItem {
  /** Inclusive d66 range on the mental trauma table. */
  range: [number, number];
  effects: string;
}

const mt = (lo: number, hi: number, name: string, effects: string): MentalTraumaItem => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  range: [lo, hi],
  name,
  effects,
  page: 74,
});

/** Id of the trauma that lowers the session-end trauma threshold to 1 (p. 74). */
export const PANIC_ATTACKS_TRAUMA = "panic-attacks";
/** Id of the trauma that lowers Resolve by 2 (p. 74). */
export const OVERWHELMED_TRAUMA = "overwhelmed";

/**
 * D66 mental trauma table (p. 74), checked against the Evolved Edition. Names and
 * ranges are data; effects are short paraphrases. Healed only on shore leave (p. 257).
 */
export const mentalTraumaItems: MentalTraumaItem[] = [
  mt(11, 13, "Confused", "−1 die on Wits-based skill rolls."),
  mt(14, 16, "Apathetic", "You can never push a roll."),
  mt(21, 23, "Reclusive", "You cannot relieve stress with others around."),
  mt(24, 26, "Obsessive", "Every skill roll must be pushed, successful or not."),
  mt(31, 32, "Overwhelmed", "Resolve −2."),
  mt(33, 34, "Alcoholic", "Only drinking relieves your stress."),
  mt(35, 36, "Depressed", "You cannot be rallied in combat."),
  mt(41, 43, "Worrisome", "Small worries the GM picks count as traumatic: +1 stress each."),
  mt(44, 44, "Changed Personality", "Take a new personal agenda, set by the GM or rolled."),
  mt(45, 46, "Phobic", "A fear tied to the trauma; every contact with it triggers a panic roll."),
  mt(51, 52, "Speech Loss", "You cannot speak; use notes or hand signs."),
  mt(53, 54, "Nightmares", "+1 stress for every shift you sleep."),
  mt(55, 56, "Flashbacks", "Whenever you gain stress, gain one more."),
  mt(61, 62, "Panic Attacks", "A panic result of 1+ (instead of 9+) in a session calls for a trauma check afterwards."),
  mt(63, 63, "Violent", "Panic results of 8 or more become Frenzy."),
  mt(64, 64, "Psychotic", "Hallucinations once per shift (GM's timing) give +1 stress."),
  mt(65, 65, "Amnesiac", "You forget who you and the other PCs are; roleplay it."),
  mt(66, 66, "Personality Split", "Make a second persona (name, Wits, Empathy, agenda, random talent); switch whenever you gain stress."),
];

export const mentalTraumas: ReferenceList = {
  id: "alien.mental-traumas",
  name: "Mental traumas",
  page: 74,
  itemSchema: {
    type: "object",
    required: ["id", "range", "name", "effects"],
    properties: {
      id: { type: "string" },
      range: { type: "array", items: { type: "integer", minimum: 11, maximum: 66 }, minItems: 2, maxItems: 2 },
      name: { type: "string" },
      effects: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: mentalTraumaItems,
};
