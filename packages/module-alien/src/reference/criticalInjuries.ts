import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

/** Time limit before a death roll for a lethal injury (p. 68, 70). */
export type CritTimeLimit = "round" | "stretch" | "shift";

export interface CriticalInjuryItem extends ReferenceItem {
  roll: number;
  /** Lethal in the book's terms: death rolls are needed unless stabilised. */
  fatal: boolean;
  /** Interval between death rolls for a lethal injury; null when not lethal or instantly fatal. */
  timeLimit: CritTimeLimit | null;
  /** Kills outright, no death roll (results 64-66, p. 71). */
  instantDeath: boolean;
  /** Healing time: dice of days ("D6", "2D6"...), "shift", "varies", or null when there is nothing to heal. */
  healingTime: string | null;
  /** Needs surgery before it starts to heal (p. 71). */
  surgery: boolean;
  effects: string;
}

const ci = (
  roll: number,
  name: string,
  fatal: boolean,
  timeLimit: CritTimeLimit | null,
  healingTime: string | null,
  effects: string,
  extra: { surgery?: boolean; instantDeath?: boolean } = {},
): CriticalInjuryItem => ({
  id: `ci-${roll}`,
  roll,
  name,
  fatal,
  timeLimit,
  instantDeath: extra.instantDeath ?? false,
  healingTime,
  surgery: extra.surgery ?? false,
  effects,
  page: 70,
});

/**
 * D66 critical injury table (p. 70), checked against the Evolved Edition. Names,
 * lethality, time limits and healing times are data; effects are short paraphrases.
 * Healing times are in days unless stated otherwise (p. 71).
 */
export const criticalInjuryItems: CriticalInjuryItem[] = [
  ci(11, "Focused", false, null, null, "Shed all your stress."),
  ci(12, "Winded", false, null, null, "No lasting effect."),
  ci(13, "Intense Pain", false, null, null, "Stress level +1."),
  ci(14, "Sprained Ankle", false, null, "shift", "Moving in combat takes a full action."),
  ci(15, "Blood in Eyes", false, null, "shift", "−1 die to Ranged Combat and Observation."),
  ci(16, "Concussion", false, null, "D6", "−1 die to Observation and Comtech."),
  ci(21, "Ear Torn Off", false, null, "D6", "−2 dice to Observation."),
  ci(22, "Broken Toes", false, null, "D6", "Moving in combat takes a full action."),
  ci(23, "Broken Fingers", false, null, "D6", "−1 die to anything that normally needs two hands."),
  ci(24, "Broken Teeth", false, null, "D6", "−2 dice to Manipulation."),
  ci(25, "Impaled Thigh", false, null, "2D6", "Moving in combat takes a full action."),
  ci(26, "Slashed Shoulder", false, null, "D6", "−2 dice to anything that normally needs two arms."),
  ci(31, "Broken Nose", false, null, "D6", "−1 die to Manipulation and Observation."),
  ci(32, "Broken Ribs", false, null, "2D6", "−2 dice to Mobility and Close Combat."),
  ci(33, "Gouged Eye", false, null, "2D6", "−2 to Ranged Combat and Observation.", { surgery: true }),
  ci(34, "Injured Throat", false, null, "2D6", "−2 dice to Manipulation and Command."),
  ci(35, "Broken Arm", false, null, "3D6", "−3 dice to anything that normally needs two arms."),
  ci(36, "Broken Leg", false, null, "3D6", "Moving in combat takes a full action."),
  ci(41, "Crushed Foot", false, null, "3D6", "Moving takes a full action.", { surgery: true }),
  ci(42, "Disfigured Face", false, null, "2D6", "−2 dice to Manipulation.", { surgery: true }),
  ci(43, "Traumatized", false, null, "varies", "Roll once for mental trauma (p. 74)."),
  ci(44, "Punctured Lung", true, "shift", "D6", "−2 dice to Mobility and Close Combat.", { surgery: true }),
  ci(45, "Bleeding Gut", true, "shift", "D6", "Take 1 damage on every Mobility or Close Combat roll."),
  ci(46, "Infected Wound", true, "shift", null, "Roll Stamina to avoid falling sick (p. 76)."),
  ci(51, "Cracked Skull", true, "shift", "3D6", "−2 dice to Observation and Comtech.", { surgery: true }),
  ci(52, "Cracked Spine", true, "shift", "4D6", "Paralysed from the waist down; cannot move.", { surgery: true }),
  ci(53, "Arm Arterial Bleeding", true, "stretch", "D6", "−1 die to anything that normally needs two arms."),
  ci(54, "Leg Arterial Bleeding", true, "stretch", "D6", "Moving in combat takes a full action."),
  ci(55, "Severed Arm", true, "stretch", "4D6", "−3 dice to anything needing two arms; needs surgery and a prosthesis.", { surgery: true }),
  ci(56, "Severed Leg", true, "stretch", "4D6", "Moving in combat takes a full action; needs surgery and a prosthesis.", { surgery: true }),
  ci(61, "Ruptured Jugular", true, "round", "2D6", "Stamina −1."),
  ci(62, "Internal Bleeding", true, "round", "3D6", "Stamina −2."),
  ci(63, "Massive Hemorrhage", true, "round", "4D6", "Stamina −3.", { surgery: true }),
  ci(64, "Disemboweled", true, null, null, "Killed instantly.", { instantDeath: true }),
  ci(65, "Crushed Head", true, null, null, "Killed instantly.", { instantDeath: true }),
  ci(66, "Impaled Heart", true, null, null, "Killed instantly.", { instantDeath: true }),
];

export const criticalInjuries: ReferenceList = {
  id: "alien.critical-injuries",
  name: "Critical injuries",
  page: 70,
  itemSchema: {
    type: "object",
    required: ["id", "roll", "name", "fatal", "effects"],
    properties: {
      id: { type: "string" },
      roll: { type: "integer", minimum: 11, maximum: 66 },
      name: { type: "string" },
      fatal: { type: "boolean" },
      timeLimit: { type: ["string", "null"], enum: ["round", "stretch", "shift", null] },
      instantDeath: { type: "boolean" },
      healingTime: { type: ["string", "null"] },
      surgery: { type: "boolean" },
      effects: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: criticalInjuryItems,
};
