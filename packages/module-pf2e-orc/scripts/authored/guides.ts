/**
 * The play guide: when to call for Perception, each skill and each save, and
 * how each degree of success should move the story. All advice here is
 * original (written for Campaign Forge); the rules it leans on are the ORC
 * core rules, linked from the rule cards.
 */
import type { PlayGuideDef, PlayGuideEntry } from "@campaign-forge/module-sdk";
import { id, SAVES, SKILLS } from "../ids.ts";

type Advice = Pick<PlayGuideEntry, "summary" | "callFor" | "success" | "failure" | "examples">;

const GROUPS = [
  { id: "awareness", label: "Awareness", summary: "Noticing, tracking and reading a situation before it reads you." },
  { id: "physical", label: "Physical", summary: "Moving, climbing, grappling and keeping your feet." },
  { id: "knowledge", label: "Knowledge", summary: "Recalling, identifying and making things." },
  { id: "social", label: "Social", summary: "Changing what other people do or believe." },
  { id: "subterfuge", label: "Subterfuge", summary: "Staying unseen and getting past locks and traps." },
  { id: "saves", label: "Saving throws", summary: "Resisting what the world does to you." },
];

const GROUP_OF: Record<string, string> = {
  perception: "awareness",
  survival: "awareness",
  acrobatics: "physical",
  athletics: "physical",
  arcana: "knowledge",
  crafting: "knowledge",
  medicine: "knowledge",
  nature: "knowledge",
  occultism: "knowledge",
  religion: "knowledge",
  society: "knowledge",
  deception: "social",
  diplomacy: "social",
  intimidation: "social",
  performance: "social",
  stealth: "subterfuge",
  thievery: "subterfuge",
  fortitude: "saves",
  reflex: "saves",
  will: "saves",
};

const ADVICE: Record<string, Advice> = {
  perception: {
    summary: "Spotting, hearing, sensing motives; also what most characters roll for initiative.",
    callFor: ["something moves at the edge of the torchlight", "a door that should be locked stands ajar", "the host's smile slips for a moment"],
    success: "They notice it in time to act on it: name the detail and what it suggests.",
    failure: "They miss it, or notice it only as it happens. Do not hide the whole adventure behind one Perception roll.",
    examples: ["Roll Perception: what do you see in the rafters?", "Roll Perception for initiative; the ambush is already moving."],
  },
  survival: {
    summary: "Tracking, finding the way, living off the land.",
    callFor: ["the trail splits at a stream", "supplies run short two days from town", "a storm is coming over the ridge"],
    success: "They find the trail, the shelter or the food, and gain time.",
    failure: "They lose time, a day's rations, or arrive somewhere other than planned.",
  },
  acrobatics: {
    summary: "Balance, tumbling, squeezing and acrobatic flying.",
    callFor: ["a narrow beam over a drop", "slipping past a foe's guard", "a rope bridge in high wind"],
    success: "They are where they wanted to be, with the next move open.",
    failure: "They stall or slip; a critical failure means a fall or a foe's free swing.",
  },
  athletics: {
    summary: "Climbing, jumping, swimming, and every grapple, shove and trip.",
    callFor: ["a cliff with a deadline", "a river in flood", "pinning the cultist before they finish the chant"],
    success: "Fast and clean: give them the position or the grip they wanted.",
    failure: "They make little headway, tire, or end up in a worse spot.",
  },
  arcana: {
    summary: "Arcane magic, constructs, magical theory and arcane creatures.",
    callFor: ["a glowing sigil on a vault door", "a construct that will not stop", "a wizard's coded notes"],
    success: "Name what it is and one useful way to deal with it.",
    failure: "They know what it is, not how it ends; a critical failure gives a confident wrong answer.",
  },
  crafting: {
    summary: "Making, repairing and understanding how things are built.",
    callFor: ["a broken axle on the road", "a lock's mechanism under a spotlight", "copying a key from a wax impression"],
    success: "It works, and they understand how; give them a fact about the maker.",
    failure: "It takes longer, costs more, or works once and then fails.",
  },
  medicine: {
    summary: "First aid, treating wounds and diseases, reading a body.",
    callFor: ["a friend bleeding out mid-fight", "a sickness spreading in the village", "how long the body has been here"],
    success: "Stable, treated or dated: give them a hard, useful fact.",
    failure: "Time passes without progress; on a critical failure the patient is hurt.",
  },
  nature: {
    summary: "Animals, plants, weather, terrain and primal magic.",
    callFor: ["which mushrooms are safe", "tracks of something heavy", "a druid's circle of standing stones"],
    success: "They know what it is and what it means for them right now.",
    failure: "They know the common case; this one is different.",
  },
  occultism: {
    summary: "Strange philosophies, aberrations, spirits and occult magic.",
    callFor: ["a haunting that repeats every night", "a sigil that hurts to look at", "a medium's séance gone wrong"],
    success: "Name the pattern and what the spirit or creature wants.",
    failure: "They recognize the shape of it but not its rules.",
  },
  religion: {
    summary: "Faiths, rites, divine magic and undead.",
    callFor: ["an unfamiliar shrine", "a priest's oddly worded blessing", "an undead that ignores holy water"],
    success: "Name the rite, the faith's customs or the creature's weakness.",
    failure: "They know the faith, but miss that this is a heresy of it.",
  },
  society: {
    summary: "Customs, law, history, etiquette and forgeries.",
    callFor: ["a noble's crest on a ring", "a law that makes no sense", "a letter that is almost right"],
    success: "Give them the custom, the person, or the flaw in the forgery.",
    failure: "They recall the popular version, which is wrong in one way that matters.",
  },
  deception: {
    summary: "Lies, feints, disguises and impersonation.",
    callFor: ["a forged pass at the gate", "a feint before the real strike", "pretending to belong at the ball"],
    success: "The lie holds for now; decide what would break it.",
    failure: "Doubt creeps in: a follow-up question, a guard sent to check.",
  },
  diplomacy: {
    summary: "Making an impression, asking for help, gathering information.",
    callFor: ["asking a stranger for directions to the ruin", "talking the mob down", "a favor from the harbor master"],
    success: "Their attitude improves, or they agree to a reasonable request.",
    failure: "No, or not yet: a price, a condition, or a task first.",
  },
  intimidation: {
    summary: "Coercing and demoralizing.",
    callFor: ["a thug who should back down", "an informant holding out", "a battle cry to break the line"],
    success: "They comply or are frightened, now. Fear has a long memory.",
    failure: "They call the bluff, get angry, or go for help.",
  },
  performance: {
    summary: "Music, acting, oratory; earning coin and attention.",
    callFor: ["earning a meal at the inn", "distracting a crowd while a friend works", "a festival contest"],
    success: "The audience is theirs: coin, attention, or a useful admirer.",
    failure: "Polite silence, a heckler, or a rival who now wants to compete.",
  },
  stealth: {
    summary: "Hiding, sneaking and avoiding notice while travelling.",
    callFor: ["slipping past sentries", "following someone through the market", "approaching the camp before dawn"],
    success: "They are unnoticed, and where they want to be.",
    failure: "Spotted at the worst moment, or they must choose: retreat or go loud.",
  },
  thievery: {
    summary: "Picking locks, disabling devices, stealing and palming.",
    callFor: ["a lock with guards on patrol", "a trap's trigger plate", "lifting a key from a belt"],
    success: "Done, quietly, and nobody saw.",
    failure: "Not done yet; on a critical failure the trap triggers or someone saw.",
  },
  fortitude: {
    summary: "Poison, disease, exhaustion, and effects that test the body.",
    callFor: ["a poisoned blade", "a day's march through the burning plain", "a cloud of spores"],
    success: "They shrug off the worst of it; describe the near miss.",
    failure: "It takes hold; make the cost visible on the sheet and in the scene.",
  },
  reflex: {
    summary: "Dodging blasts, traps and falling rocks.",
    callFor: ["a fireball", "the floor giving way", "a scything blade from the wall"],
    success: "They dive clear, or take only part of it.",
    failure: "Caught: they take it in full, and maybe end up prone.",
  },
  will: {
    summary: "Fear, charms, illusions and mental attacks.",
    callFor: ["a dragon's frightful presence", "a voice that commands obedience", "an illusion that seems too real"],
    success: "Their mind stays their own; let them see the trick for what it is.",
    failure: "The fear or the charm lands; play it, then let them fight it next turn.",
  },
};

export const playGuide: PlayGuideDef = {
  id: id("guide.checks"),
  title: "Calling for checks",
  original: true,
  intro:
    "Call for a check only when failure is interesting and the outcome uncertain. Set the DC before the dice land: use a simple DC for the task's proficiency (untrained 10, trained 15, expert 20, master 30, legendary 40) or the level-based DC for the threat. Every roll has four outcomes: decide what a critical success and a critical failure look like, not only pass or fail.",
  tips: [
    { text: "No roll when there is time and no cost to retrying: the character succeeds, given time." },
    { text: "Read all four degrees. A critical success should feel like more than a success (extra information, extra time, an advantage for the next roll); a critical failure costs something more than a failure." },
    { text: "Fortune and misfortune (roll twice, keep the higher or lower) are for special effects; for a good plan or bad footing use +2 or −2 circumstance modifiers instead." },
    { text: "A natural 20 improves the result one step and a natural 1 worsens it one step: a natural 20 that misses the DC by 3 is still a success." },
    { text: "Use Perception for initiative unless the characters were already doing something: sneaking rolls Stealth, talking rolls Deception or Diplomacy." },
    { text: "Recall Knowledge is a free action economy for curious players: answer one useful question on a success, two on a critical success." },
  ],
  groups: GROUPS,
  entries: [...SAVES, ...SKILLS].map((s): PlayGuideEntry => {
    const advice = ADVICE[s.id];
    const group = GROUP_OF[s.id];
    if (!advice || !group) throw new Error(`no play advice for ${s.id}`);
    return { id: s.id, label: s.name, group, kind: "skill", roll: s.id, ...advice };
  }),
};
