import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, T, TR, card } from "./card";

export const stressPanicRules: RuleCard[] = [
  card("stress", "Stress", "Stress is a number that rises when you push, get hurt, see horrors or run out of things. Every point adds a stress die to your rolls: more chances to succeed, more chances of a facehugger.", 44, {
    tags: ["stress"],
    links: { fields: [F.stress], rules: ["alien.rule.push", "alien.rule.stress-response", "alien.rule.panic-triggers", "alien.rule.stress-recovery"], trackers: [TR.stress] },
  }),
  card("stress-response", "Stress response", "When a stress die shows a facehugger, the roll cannot be pushed and you make a stress response roll: D6 plus stress minus Resolve, read on an eight-row table from Keeping Cool to Mess Up.", 44, {
    tags: ["stress", "dice"],
    links: { tables: [T.stressResponse], fields: [F.stress], rules: ["alien.rule.resolve"], trackers: [TR.stress] },
  }),
  card("stress-recovery", "Recovering stress", "A quiet scene, a successful Command roll from a friend, a meal, a drink or your signature item each knock stress down by one. A full rest in safety clears it entirely.", 45, {
    tags: ["stress", "recovery"],
    links: { fields: [F.stress, F.signatureItem], rules: ["alien.rule.signature-item"], trackers: [TR.stress] },
  }),
  card("panic-triggers", "Panic triggers", "Certain events force a panic roll regardless of the dice: taking damage, seeing a friend Broken or killed, facing a creature for the first time, running out of air, and similar shocks.", 72, {
    tags: ["stress", "panic"],
    links: { rules: ["alien.rule.panic-roll"], trackers: [TR.stress] },
  }),
  card("panic-roll", "Panic roll", "Roll D6 plus stress minus Resolve and read the thirteen-row panic table. A total of 9 or more marks the character for a mental trauma check at the end of the session.", [72, 73], {
    tags: ["stress", "panic", "dice"],
    links: { tables: [T.panic], fields: [F.stress], rules: ["alien.rule.panic-results", "alien.rule.mental-trauma"], trackers: [TR.stress] },
  }),
  card("panic-results", "Panic results", "Results climb from Keeping Cool through Spooked, Noisy, Twitchy, Lose Item, Paranoid, Hesitant, Freeze, Seek Cover, Scream, Flee and Frenzy to Catatonic. Most spread stress to everyone nearby.", 73, {
    tags: ["stress", "panic"],
    links: { tables: [T.panic], rules: ["alien.rule.panic-roll"] },
  }),
  card("panic-contagion", "Panic is contagious", "Many panic results raise the stress of every friendly character who sees it, which can set off their own panic rolls in a chain.", 73, {
    tags: ["stress", "panic"],
    links: { tables: [T.panic], trackers: [TR.stress] },
  }),
  card("mental-trauma", "Mental trauma", "At session end, a character who had a panic result of 9 or more rolls Empathy; on a failure roll a D6 on the mental trauma table and keep the result as a lasting condition.", 74, {
    tags: ["stress", "panic", "trauma"],
    links: { tables: [T.mentalTrauma], fields: [F.mentalTraumas], rules: ["alien.rule.panic-roll", "alien.rule.mental-trauma-healing"], trackers: [TR.stress] },
  }),
  card("mental-trauma-healing", "Healing mental trauma", "Traumas do not fade on their own. In campaign play they can be treated during shore leave; cinematic characters carry them to the end.", [74, 257], {
    mode: [CAMPAIGN],
    tags: ["stress", "trauma", "campaign"],
    links: { fields: [F.mentalTraumas], rules: ["alien.rule.shore-leave"] },
  }),
  card("npcs-and-panic", "NPCs and panic", "The GM decides when an NPC panics rather than rolling every time; creatures never panic and never roll stress dice.", 155, {
    tags: ["stress", "panic", "npc"],
    links: { rules: ["alien.rule.npcs"] },
  }),
];
