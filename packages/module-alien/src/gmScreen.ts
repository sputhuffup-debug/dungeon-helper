/**
 * The Alien GM screen: every block points at a rule card, table or play
 * guide entry already in this module (verified paraphrases with page
 * references); there is no screen-only rules text. The GM side carries
 * rolls, stress and panic, combat and injuries; the player side carries
 * the turn, gear and supply, and recovery.
 */
import type { GmScreenDef } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "./modes";

export const gmScreen: GmScreenDef = {
  title: "GM screen",
  panels: [
    {
      id: "rolls",
      title: "Rolls and pushing",
      blocks: [
        { kind: "rule", rule: "alien.rule.skill-rolls" },
        { kind: "rule", rule: "alien.rule.difficulty" },
        { kind: "rule", rule: "alien.rule.push" },
        { kind: "rule", rule: "alien.rule.helping" },
        { kind: "rule", rule: "alien.rule.bonus-effects" },
        { kind: "rule", rule: "alien.rule.opposed-rolls" },
        { kind: "rule", rule: "alien.rule.passive-rolls" },
        { kind: "rule", rule: "alien.rule.story-point-award", mode: [CINEMATIC] },
        { kind: "table", table: "alien.character.stress-response" },
      ],
    },
    {
      id: "panic",
      title: "Stress and panic",
      blocks: [
        { kind: "rule", rule: "alien.rule.stress" },
        { kind: "rule", rule: "alien.rule.panic-triggers" },
        { kind: "table", table: "alien.character.panic", title: "Panic table" },
        { kind: "rule", rule: "alien.rule.stopping-panic" },
        { kind: "rule", rule: "alien.rule.panic-contagion" },
        { kind: "rule", rule: "alien.rule.npcs-and-panic" },
      ],
    },
    {
      id: "combat",
      title: "Combat and damage",
      blocks: [
        { kind: "rule", rule: "alien.rule.initiative" },
        { kind: "rule", rule: "alien.rule.range-bands" },
        { kind: "rule", rule: "alien.rule.attack-ranged" },
        { kind: "rule", rule: "alien.rule.damage-armor" },
        { kind: "rule", rule: "alien.rule.broken" },
        { kind: "rule", rule: "alien.rule.critical-injuries" },
        { kind: "rule", rule: "alien.rule.death" },
        { kind: "rule", rule: "alien.rule.damage-types" },
      ],
    },
    {
      id: "turn",
      title: "Your turn",
      side: "players",
      blocks: [
        { kind: "rule", rule: "alien.rule.actions" },
        { kind: "rule", rule: "alien.rule.fast-actions" },
        { kind: "rule", rule: "alien.rule.slow-actions" },
        { kind: "rule", rule: "alien.rule.block-dodge" },
        { kind: "rule", rule: "alien.rule.cover" },
        { kind: "rule", rule: "alien.rule.zones" },
        { kind: "rule", rule: "alien.rule.range-bands" },
        { kind: "rule", rule: "alien.rule.movement" },
        { kind: "rule", rule: "alien.rule.attack-close" },
      ],
    },
    {
      id: "supply",
      title: "Gear and supply",
      side: "players",
      blocks: [
        { kind: "rule", rule: "alien.rule.encumbrance" },
        { kind: "rule", rule: "alien.rule.consumables" },
        { kind: "rule", rule: "alien.rule.supply-rolls" },
        { kind: "rule", rule: "alien.rule.air-supply" },
        { kind: "rule", rule: "alien.rule.ammo-supply" },
        { kind: "rule", rule: "alien.rule.power-supply" },
        { kind: "rule", rule: "alien.rule.full-auto" },
      ],
    },
    {
      id: "recovery",
      title: "Stress and recovery",
      side: "players",
      blocks: [
        { kind: "rule", rule: "alien.rule.stress-recovery" },
        { kind: "rule", rule: "alien.rule.healing" },
        { kind: "rule", rule: "alien.rule.fatigue" },
        { kind: "rule", rule: "alien.rule.mental-trauma" },
        { kind: "rule", rule: "alien.rule.medical-equipment" },
        { kind: "rule", rule: "alien.rule.story-points", mode: [CINEMATIC] },
      ],
    },
    {
      id: "hints",
      title: "Skills in the story",
      optional: true,
      blocks: [
        { kind: "guide", tips: [0, 1, 2] },
        { kind: "guide", title: "When to call for them", entries: ["observation", "comtech", "survival", "command", "medicalAid", "manipulation"] },
      ],
    },
    {
      id: "critical-injuries",
      title: "Critical injuries",
      optional: true,
      blocks: [{ kind: "table", table: "alien.character.critical-injury", columns: ["timeLimit", "effect"] }],
    },
    {
      id: "hazards",
      title: "Hazards",
      optional: true,
      blocks: [
        { kind: "rule", rule: "alien.rule.suffocation" },
        { kind: "rule", rule: "alien.rule.vacuum" },
        { kind: "rule", rule: "alien.rule.explosive-decompression" },
        { kind: "rule", rule: "alien.rule.radiation" },
        { kind: "rule", rule: "alien.rule.fire" },
        { kind: "rule", rule: "alien.rule.zero-gravity" },
        { kind: "rule", rule: "alien.rule.falling" },
        { kind: "rule", rule: "alien.rule.heat-cold" },
      ],
    },
    {
      id: "xenomorphs",
      title: "Xenomorphs",
      optional: true,
      blocks: [
        { kind: "rule", rule: "alien.rule.creature-attacks" },
        { kind: "rule", rule: "alien.rule.creature-speed" },
        { kind: "rule", rule: "alien.rule.creature-armor" },
        { kind: "rule", rule: "alien.rule.acid-splash" },
        { kind: "rule", rule: "alien.rule.motion-tracker" },
      ],
    },
  ],
};
