/**
 * The pack's GM screen (`gmScreen`): references to the SRD 5.1 rule cards
 * (excerpts by section and part, the SRD's own words), the conditions'
 * helper text from `d20Combat`, the play guide's tips, and a few quick-rules
 * notes in our own words that cite the cards they condense. The GM side
 * carries checks, combat edge cases and adventuring; the player side
 * carries actions, cover and position, and the conditions.
 */
import type { GmScreenDef } from "@campaign-forge/module-sdk";
import { LIST, rule } from "../ids.ts";

export const gmScreen: GmScreenDef = {
  title: "GM screen",
  panels: [
    {
      id: "checks",
      title: "Checks and DCs",
      blocks: [
        { kind: "rule", rule: rule("ability-checks.typical-difficulty-classes"), title: "Typical DCs", parts: [0] },
        {
          kind: "text",
          title: "Advantage and disadvantage",
          text: "Roll two d20s: **advantage** keeps the higher, **disadvantage** the lower. Several sources still give only one extra d20, and having both cancels them out: roll one d20.",
          original: true,
          rules: [rule("advantage-and-disadvantage")],
        },
        { kind: "rule", rule: rule("ability-checks.passive-checks"), title: "Passive checks", parts: [2, 3] },
        { kind: "rule", rule: rule("ability-checks.working-together"), title: "Group checks", section: "Group Checks", parts: [1] },
        { kind: "rule", rule: rule("casting-a-spell.duration"), title: "Concentration", section: "Concentration", parts: [0, 2, 3] },
        { kind: "guide", title: "Calling for rolls", tips: [0, 1, 3, 5] },
      ],
    },
    {
      id: "combat",
      title: "Combat rulings",
      blocks: [
        { kind: "rule", rule: rule("the-order-of-combat.surprise"), title: "Surprise", parts: [2] },
        { kind: "rule", rule: rule("making-an-attack.attack-rolls"), title: "Rolling 1 or 20", section: "Rolling 1 or 20", parts: [1, 2] },
        { kind: "rule", rule: rule("making-an-attack.unseen-attackers-and-targets"), title: "Unseen attackers and targets", parts: [1, 2] },
        { kind: "rule", rule: rule("damage-and-healing.damage-resistance-and-vulnerability"), title: "Resistance and vulnerability", parts: [1] },
        { kind: "rule", rule: rule("damage-and-healing.dropping-to-0-hit-points"), title: "Death saving throws", section: "Death Saving Throws" },
        { kind: "rule", rule: rule("damage-and-healing.dropping-to-0-hit-points"), title: "Instant death", section: "Instant Death", parts: [0] },
        { kind: "rule", rule: rule("damage-and-healing.dropping-to-0-hit-points"), title: "Stabilizing a creature", section: "Stabilizing a Creature", parts: [1, 2] },
      ],
    },
    {
      id: "adventuring",
      title: "Adventuring",
      blocks: [
        { kind: "rule", rule: rule("movement.speed"), title: "Travel pace", section: "Travel Pace", parts: [7, 1, 2] },
        { kind: "rule", rule: rule("the-environment.vision-and-light"), title: "Light and vision", parts: [1, 2, 4, 6, 7] },
        { kind: "rule", rule: rule("the-environment.vision-and-light"), title: "Darkvision", section: "Darkvision" },
        { kind: "rule", rule: rule("resting.short-rest"), title: "Short rest" },
        { kind: "rule", rule: rule("resting.long-rest"), title: "Long rest", parts: [1, 2] },
        { kind: "conditions", title: "Exhaustion", conditions: ["exhaustion"] },
        { kind: "rule", rule: rule("the-environment.falling"), title: "Falling" },
      ],
    },
    {
      id: "actions",
      title: "Actions in combat",
      side: "players",
      blocks: [
        { kind: "rule", rule: rule("the-order-of-combat.your-turn"), title: "Your turn", parts: [0, 6, 11] },
        {
          kind: "text",
          title: "Actions",
          text: [
            "- **Attack:** a melee or ranged attack.",
            "- **Cast a Spell:** casting time of 1 action.",
            "- **Dash:** extra movement equal to your speed.",
            "- **Disengage:** no opportunity attacks against you this turn.",
            "- **Dodge:** attacks against you have disadvantage; Dexterity saves with advantage.",
            "- **Help:** an ally gets advantage on its next check, or its next attack on a foe within 5 feet of you.",
            "- **Hide:** a Dexterity (Stealth) check.",
            "- **Ready:** choose a trigger and an action; take it as your reaction.",
            "- **Search:** a Perception or Investigation check.",
            "- **Use an Object:** a second object, or one that takes an action.",
          ].join("\n"),
          original: true,
          rules: [rule("actions-in-combat")],
        },
        { kind: "rule", rule: rule("the-order-of-combat.reactions"), title: "Reactions and opportunity attacks" },
      ],
    },
    {
      id: "position",
      title: "Cover and position",
      side: "players",
      blocks: [
        { kind: "rule", rule: rule("cover"), title: "Cover", parts: [2, 3, 4] },
        { kind: "rule", rule: rule("movement-and-position.difficult-terrain"), title: "Difficult terrain", parts: [1] },
        { kind: "rule", rule: rule("movement-and-position.being-prone"), title: "Being prone", parts: [1, 2, 3] },
        { kind: "rule", rule: rule("making-an-attack.ranged-attacks"), title: "Ranged attacks in close combat", section: "Ranged Attacks in Close Combat" },
        { kind: "list", list: LIST.damageTypes, title: "Damage types", summary: false },
      ],
    },
    {
      id: "conditions",
      title: "Conditions",
      side: "players",
      blocks: [{ kind: "conditions" }],
    },
    {
      id: "damage-types",
      title: "Damage types",
      optional: true,
      blocks: [{ kind: "list", list: LIST.damageTypes }],
    },
    {
      id: "spellcasting",
      title: "Spellcasting",
      optional: true,
      blocks: [
        { kind: "rule", rule: rule("casting-a-spell.components"), title: "Components" },
        { kind: "rule", rule: rule("casting-a-spell.spell-saving-throws"), title: "Spell saving throws" },
        { kind: "rule", rule: rule("casting-a-spell.spell-attack-rolls"), title: "Spell attack rolls" },
        { kind: "rule", rule: rule("casting-a-spell.combining-magical-effects"), title: "Combining magical effects" },
      ],
    },
  ],
};
