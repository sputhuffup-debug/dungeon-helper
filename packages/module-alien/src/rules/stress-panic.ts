import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, T, TR, card } from "./card";

/** Stress, stress responses and panic (p. 44, 72-74). */
export const stressPanicRules: RuleCard[] = [
  card("stress", "Stress level", "Stress starts at zero and adds one stress die per level to every skill roll. It rises when you push, when you or a nearby PC suffer certain stress or panic responses, when a nearby NPC panics, on extra full-auto bursts, fatigue, an attack by your own crew, a nearby person revealed as an android, or any unnerving event the GM chooses.", 72, {
    tags: ["stress"],
    links: { fields: [F.stress], rules: ["alien.rule.push", "alien.rule.stress-response", "alien.rule.panic-triggers", "alien.rule.stress-recovery"], trackers: [TR.stress] },
  }),
  card("stress-response", "Stress response", "A facehugger on any stress die triggers a stress response: D6 plus stress level minus Resolve, from Keeping Cool (0 or less) through Jumpy, Tunnel Vision, Aggravated, Shakes, Frantic and Deflated to Mess Up (7+). Rolling a response you already have gives +1 stress instead; responses go away as stress is relieved.", 44, {
    tags: ["stress", "dice"],
    links: { tables: [T.stressResponse], fields: [F.stress], rules: ["alien.rule.resolve", "alien.rule.stress-recovery"], trackers: [TR.stress] },
  }),
  card("stress-recovery", "Relieving stress", "Each stretch of rest in a safe area lowers stress by one and removes one stress response of your choice per level lost. You cannot make skill rolls while resting, and an interrupted rest does not count. Some panic results and certain drugs also lower stress.", 73, {
    tags: ["stress", "recovery"],
    links: { fields: [F.stress], rules: ["alien.rule.pharmaceuticals", "alien.rule.panic-results"], trackers: [TR.stress] },
  }),
  card("panic-triggers", "When to roll for panic", "Roll for panic when you see another PC broken, see a Xenomorph for the first time, have one come within Adjacent range, see another PC suffer certain panic responses, or face anything the adventure or GM deems truly horrifying.", 72, {
    tags: ["stress", "panic"],
    links: { rules: ["alien.rule.panic-roll"], trackers: [TR.stress] },
  }),
  card("panic-roll", "Panic roll", "Roll D6, add your stress level, subtract Resolve and read the panic table. While already panicking you suffer both responses where they combine, otherwise the higher one; repeating a response you have moves you one row up.", 72, {
    tags: ["stress", "panic", "dice"],
    links: { tables: [T.panic], fields: [F.stress], rules: ["alien.rule.panic-results", "alien.rule.stopping-panic", "alien.rule.mental-trauma"], trackers: [TR.stress] },
  }),
  card("panic-results", "Panic responses", "Thirteen results from Keeping Cool (0 or less) through Spooked, Noisy, Twitchy, Lose Item, Paranoid, Hesitant, Freeze, Seek Cover, Scream, Flee and Frenzy to Catatonic (12+). The worse results cost turns or control, and Seek Cover, Scream and Flee also lower your own stress by one.", 73, {
    tags: ["stress", "panic"],
    links: { tables: [T.panic], rules: ["alien.rule.panic-roll", "alien.rule.panic-contagion"] },
  }),
  card("stopping-panic", "Stopping panic", "Some responses are immediate or last until your next turn. The rest last until another character within speaking range, comms included, succeeds at a Command roll (a full action in combat), you are broken, or a stretch passes.", 72, {
    tags: ["stress", "panic"],
    links: { rules: ["alien.rule.panic-results", "alien.rule.giving-orders"] },
  }),
  card("panic-contagion", "Panic spreads", "A Scream or a Frenzy forces every friendly PC in the zone to roll for panic, and Flee gives +1 stress to friendly PCs in the zone you left. Seeing another PC suffer such a response is itself a panic trigger, so one bad roll can start a chain.", 73, {
    tags: ["stress", "panic"],
    links: { tables: [T.panic], rules: ["alien.rule.panic-triggers"], trackers: [TR.stress] },
  }),
  card("mental-trauma", "Mental trauma", "A PC who rolled 9 or more on a panic roll during the session rolls Empathy alone, unpushed, after the session. On a failure, roll D66 on the mental trauma table. Discuss the topic as a group first, and drop the rule if anyone prefers.", 74, {
    tags: ["stress", "panic", "trauma"],
    links: { tables: [T.mentalTrauma], fields: [F.mentalTraumas], rules: ["alien.rule.panic-roll", "alien.rule.mental-trauma-healing", "alien.rule.session-end"], trackers: [TR.stress] },
  }),
  card("mental-trauma-healing", "Healing mental trauma", "Mental trauma heals only during shore leave in campaign play. The Recover activity is an unpushed Empathy roll that removes one trauma on a success.", 257, {
    mode: [CAMPAIGN],
    tags: ["stress", "trauma", "campaign"],
    links: { fields: [F.mentalTraumas], rules: ["alien.rule.shore-leave", "alien.rule.mental-trauma"] },
  }),
  card("npcs-and-panic", "NPCs, stress and panic", "NPCs never push and have no stress level; the GM simply decides when an NPC panics, which raises the stress of nearby PCs. Xenomorphs never push either.", [42, 72], {
    tags: ["stress", "panic", "npc"],
    links: { rules: ["alien.rule.npcs", "alien.rule.stress"] },
  }),
];
