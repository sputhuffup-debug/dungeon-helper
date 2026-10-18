import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";
import { F, TR, card } from "./card";

export const coreRules: RuleCard[] = [
  card("play-modes", "Play modes", "The book marks rules with a Cinematic or Campaign icon. Cinematic play is a short, lethal scenario with pregenerated characters; Campaign play is long-form with player-built crews, jobs and advancement.", [18, 24], {
    tags: ["core", "modes"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.campaign-structure"] },
  }),
  card("character-creation", "Creating a character", "Pick a career, spend attribute and skill points within career limits, take one career talent, then choose agenda, buddy and rival, gear and a signature item. Campaign crews may instead roll Life Paths.", 26, {
    mode: [CAMPAIGN],
    tags: ["core", "character"],
    links: { fields: [F.career, F.attributes, F.skills], rules: ["alien.rule.careers", "alien.rule.life-paths"] },
  }),
  card("attributes", "Attributes", "Four attributes: Strength, Agility, Wits and Empathy, rated 1 to 5 for humans. Each skill is bound to one attribute and the two add together to form your base dice.", 26, {
    tags: ["core", "character"],
    links: { fields: [F.attributes], rules: ["alien.rule.skill-rolls", "alien.rule.androids"] },
  }),
  card("androids", "Androids", "Synthetic characters may exceed the human attribute cap (up to 8 in the key attribute and 7 elsewhere), never roll stress dice, never push and never panic. They can be Broken like anyone else.", 25, {
    tags: ["core", "character", "android"],
    links: { fields: [F.android, F.stress], rules: ["alien.rule.push", "alien.rule.stress"] },
  }),
  card("careers", "Careers", "Nine careers: Colonial Marine, Colonial Marshal, Company Agent, Kid, Medic, Officer, Pilot, Roughneck and Scientist. Each sets a key attribute, three key skills, three career talents, starting cash and pick lists for names, looks, agendas, gear and signature items.", [31, 39], {
    tags: ["core", "character"],
    links: { fields: [F.career], rules: ["alien.rule.talents", "alien.rule.cash"] },
  }),
  card("health", "Health", "Health is half of Strength plus Agility, rounded up, plus one if you have the Hardened talent. Damage reduces it; at zero you are Broken.", 26, {
    tags: ["core", "character", "damage"],
    links: { fields: [F.attributes, F.talents], rules: ["alien.rule.broken", "alien.rule.damage-armor"] },
  }),
  card("resolve", "Resolve", "Resolve is half of Wits plus Empathy, rounded up, plus one with Seen It All. It is subtracted from stress response and panic rolls, so calmer heads get milder results.", 26, {
    tags: ["core", "character", "stress"],
    links: { fields: [F.attributes, F.talents], rules: ["alien.rule.stress-response", "alien.rule.panic-roll"], trackers: [TR.stress] },
  }),
  card("skill-rolls", "Skill rolls", "Roll base dice equal to attribute plus skill (plus gear and modifiers) and stress dice equal to your stress level. Any 6 is a success; one success is enough, extras may buy bonus effects.", 42, {
    tags: ["core", "dice"],
    links: { fields: [F.skills, F.attributes, F.stress], rules: ["alien.rule.difficulty", "alien.rule.push", "alien.rule.helping"] },
  }),
  card("difficulty", "Difficulty modifiers", "The GM sets a modifier from about +3 (trivial) to −3 (near impossible) that adds or removes base dice. You always roll at least one base die.", 42, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("push", "Pushing a roll", "After a failed or weak roll you may push once: keep every 6, raise your stress by one, add a stress die and re-roll the rest. You cannot push if a stress die already showed a facehugger, and androids and NPCs never push.", 43, {
    tags: ["core", "dice", "stress"],
    links: { fields: [F.stress], rules: ["alien.rule.stress", "alien.rule.stress-response", "alien.rule.androids"], trackers: [TR.stress] },
  }),
  card("helping", "Helping", "Up to three characters may help someone's roll if they are in position to; each helper adds one base die. Helpers share the consequences of a push on the same roll.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("opposed-rolls", "Opposed rolls", "When two characters contest, both roll and the side with more successes wins; the attacker wins ties only where the rule says so. Pushing is allowed as usual.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls", "alien.rule.push"] },
  }),
  card("bonus-effects", "Extra successes", "Successes beyond the first can be spent on bonus effects listed under each skill, such as extra damage, helping a friend or working faster.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("story-points", "Story Points", "Cinematic characters hold up to three Story Points, earned by pursuing their act agenda. Spend one to turn a base die into a success before or after pushing.", 44, {
    mode: [CINEMATIC],
    tags: ["core", "dice", "cinematic"],
    links: { fields: [F.storyPoints], rules: ["alien.rule.story-point-award", "alien.rule.cinematic-agendas"], trackers: [TR.storyPoints] },
  }),
  card("talents", "Talents", "Talents are small, named edges: each career has three, and general talents are open to all. Most give a bonus in a narrow situation; some stack, with a limit.", [48, 51], {
    tags: ["core", "character"],
    links: { fields: [F.talents], rules: ["alien.rule.careers"] },
  }),
  card("signature-item", "Signature item", "A small personal object. Spending a moment with it in a quiet scene lets you lower your stress by one.", 27, {
    tags: ["core", "character", "stress"],
    links: { fields: [F.signatureItem, F.stress], rules: ["alien.rule.stress-recovery"] },
  }),
  card("cash", "Starting cash", "Each career gives a starting cash formula (for example a D6 times a few hundred dollars). Gear beyond the career picks is bought from it; in campaign play, jobs add to it.", 29, {
    tags: ["core", "character", "gear"],
    links: { fields: [F.cash], rules: ["alien.rule.job-payment"] },
  }),
  card("life-paths", "Life Paths", "Campaign characters may be built by rolling origin, early life, a life event, career entry, favors, disasters and postings, each step nudging attributes, skills and the psych evaluation. Every roll is kept as provenance.", [282, 289], {
    mode: [CAMPAIGN],
    tags: ["core", "character", "generator"],
    links: { tables: ["alien.lifepath.origin"], rules: ["alien.rule.character-creation"] },
  }),
  card("npcs", "Non-player characters", "NPCs get attributes, Health, a handful of skills, at most one talent, gear, a trait, a goal and an appearance. They do not push, and the GM decides when they panic.", 155, {
    tags: ["core", "gm", "npc"],
    links: { rules: ["alien.rule.npc-presets", "alien.rule.npcs-and-panic"] },
  }),
];
