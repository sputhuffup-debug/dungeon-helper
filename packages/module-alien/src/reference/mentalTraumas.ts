import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

export interface MentalTraumaItem extends ReferenceItem {
  roll: number;
  effects: string;
  unverified: true;
}

const mt = (roll: number, name: string, effects: string): MentalTraumaItem => ({
  id: `mt-${roll}`,
  roll,
  name,
  effects,
  page: 74,
  unverified: true,
});

/** D6 mental trauma list (p. 74). Placeholder entries from general knowledge; unverified. */
export const mentalTraumaItems: MentalTraumaItem[] = [
  mt(1, "Phobia", "A specific fear tied to the trigger; stress when confronted with it."),
  mt(2, "Substance dependency", "Needs a fix each shift or suffers a stress penalty."),
  mt(3, "Nightmares", "Sleep is not rest; starts each shift with stress."),
  mt(4, "Depression", "Cannot be helped out of stress by others' Command rolls."),
  mt(5, "Flashbacks", "Panic triggers hit harder; +1 to panic rolls."),
  mt(6, "Paranoia", "Cannot help or be helped by a chosen crewmate."),
];

export const mentalTraumas: ReferenceList = {
  id: "alien.mental-traumas",
  name: "Mental traumas",
  page: 74,
  unverified: true,
  itemSchema: {
    type: "object",
    required: ["id", "roll", "name", "effects"],
    properties: {
      id: { type: "string" },
      roll: { type: "integer", minimum: 1, maximum: 6 },
      name: { type: "string" },
      effects: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: mentalTraumaItems,
};
