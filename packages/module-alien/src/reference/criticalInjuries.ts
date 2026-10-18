import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";

export interface CriticalInjuryItem extends ReferenceItem {
  roll: number;
  fatal: boolean;
  /** Time before death if fatal and untreated, e.g. "1 round", "1 shift"; null if not fatal. */
  timeLimit: string | null;
  effects: string;
  unverified: true;
}

const ci = (roll: number, name: string, fatal: boolean, timeLimit: string | null, effects: string): CriticalInjuryItem => ({
  id: `ci-${roll}`,
  roll,
  name,
  fatal,
  timeLimit,
  effects,
  page: roll <= 36 ? 69 : 70,
  unverified: true,
});

/**
 * D66 critical injury list (p. 69-70) in d66 order. Row names and effects are
 * placeholders from general knowledge of the game; flagged unverified.
 */
export const criticalInjuryItems: CriticalInjuryItem[] = [
  ci(11, "Winded", false, null, "Short of breath; penalty to Stamina rolls until a short rest."),
  ci(12, "Stunned", false, null, "Lose your next slow action."),
  ci(13, "Bruised shin", false, null, "Penalty to Mobility until rested."),
  ci(14, "Wrenched shoulder", false, null, "Penalty to Close Combat and Heavy Machinery until rested."),
  ci(15, "Concussion", false, null, "Penalty to Wits-based skills for a shift."),
  ci(16, "Broken nose", false, null, "Penalty to Manipulation for a day; bleeding."),
  ci(21, "Broken fingers", false, null, "Penalty to Ranged Combat and Comtech until healed."),
  ci(22, "Broken toes", false, null, "Penalty to Mobility until healed."),
  ci(23, "Bleeding gut wound", true, "1 shift", "Penalty to Strength-based skills; dies without care."),
  ci(24, "Shattered knee", false, null, "Cannot run; Mobility heavily penalised until healed."),
  ci(25, "Crushed hand", false, null, "One hand unusable until healed."),
  ci(26, "Torn ear", false, null, "Penalty to Observation (hearing) until healed."),
  ci(31, "Cracked ribs", false, null, "Penalty to Strength and Agility skills until healed."),
  ci(32, "Deep cut", true, "1 shift", "Bleeding; dies without care."),
  ci(33, "Broken arm", false, null, "One arm unusable; penalty to two-handed actions."),
  ci(34, "Broken leg", false, null, "Cannot run or climb; crawl only."),
  ci(35, "Ruptured eardrum", false, null, "Deaf in one ear; Observation penalty."),
  ci(36, "Gouged eye", false, null, "Vision halved; Ranged Combat and Observation penalties."),
  ci(41, "Punctured lung", true, "1 shift", "Cannot run; dies without surgery."),
  ci(42, "Skull fracture", true, "1 shift", "Unconscious; dies without surgery."),
  ci(43, "Severed artery", true, "1 round", "Massive bleeding; dies within a round without immediate aid."),
  ci(44, "Crushed pelvis", true, "1 shift", "Cannot move; dies without surgery."),
  ci(45, "Internal bleeding", true, "1 shift", "Collapses; dies without surgery."),
  ci(46, "Shattered spine", true, "1 shift", "Paralysed; dies without surgery."),
  ci(51, "Impaled", true, "1 shift", "Object lodged; removing it without care causes bleeding."),
  ci(52, "Disembowelled", true, "1 round", "Dies within a round without immediate aid."),
  ci(53, "Crushed skull", true, "1 round", "Unconscious and dying."),
  ci(54, "Severed leg", true, "1 shift", "Leg lost; bleeding out."),
  ci(55, "Severed arm", true, "1 shift", "Arm lost; bleeding out."),
  ci(56, "Torn throat", true, "1 round", "Cannot speak; dying."),
  ci(61, "Burst heart", true, "immediate", "Dead unless a miracle intervenes."),
  ci(62, "Broken neck", true, "immediate", "Dead."),
  ci(63, "Brain destroyed", true, "immediate", "Dead."),
  ci(64, "Cut in half", true, "immediate", "Dead."),
  ci(65, "Ripped apart", true, "immediate", "Dead; nothing to recover."),
  ci(66, "Obliterated", true, "immediate", "Dead; nothing to recover."),
];

export const criticalInjuries: ReferenceList = {
  id: "alien.critical-injuries",
  name: "Critical injuries",
  page: [69, 70],
  unverified: true,
  itemSchema: {
    type: "object",
    required: ["id", "roll", "name", "fatal", "effects"],
    properties: {
      id: { type: "string" },
      roll: { type: "integer", minimum: 11, maximum: 66 },
      name: { type: "string" },
      fatal: { type: "boolean" },
      timeLimit: { type: ["string", "null"] },
      effects: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: criticalInjuryItems,
};
