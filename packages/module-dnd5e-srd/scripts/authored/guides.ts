/**
 * The play guide: when to call for each ability check and skill, and how a
 * success or a failure should move the story. All advice here is original
 * (written for Campaign Forge); the rules it leans on are the SRD's.
 */
import type { PlayGuideDef, PlayGuideEntry } from "@campaign-forge/module-sdk";
import { ABILITIES, id, SKILLS } from "../ids.ts";

type Advice = Pick<PlayGuideEntry, "summary" | "callFor" | "success" | "failure" | "examples">;

const ABILITY_ADVICE: Record<string, Advice> = {
  strength: {
    summary: "Raw force: lifting, shoving, breaking, holding on.",
    callFor: ["a door is barred and time is short", "someone tries to wrestle an object away", "the bridge ropes snap and a hero has to hold the weight"],
    success: "The obstacle gives way, loudly. Ask what they do with the opening.",
    failure: "It holds, and the effort costs something: noise, time, or a dropped torch.",
    examples: ["Make a Strength check to force the portcullis up."],
  },
  dexterity: {
    summary: "Balance, nimble hands, quick reactions.",
    callFor: ["a ledge is narrow and the wind is up", "a hand slips into a pocket in a crowd", "a falling chandelier gives a heartbeat of warning"],
    success: "Smooth and quiet; they are where they wanted to be.",
    failure: "They make it, but not cleanly: a stumble, a scrape, or someone noticed.",
    examples: ["Roll Dexterity to catch the vial before it shatters."],
  },
  constitution: {
    summary: "Endurance: pushing on, holding breath, keeping food down.",
    callFor: ["a forced march goes past nightfall", "the swamp air is foul", "a drinking contest decides who gets the map"],
    success: "They keep going; the cost lands on someone or something else.",
    failure: "They pay in time, a level of exhaustion if the rules call for it, or a lost advantage.",
    examples: ["Constitution check: can you keep pace through the night?"],
  },
  intelligence: {
    summary: "Recall, reasoning and deduction.",
    callFor: ["a clue only makes sense with the right knowledge", "a mechanism has a logic to it", "two accounts of the same night disagree"],
    success: "Give a real, specific fact or connection, not a vague hint.",
    failure: "They still learn something, but it is incomplete or comes with a wrong assumption.",
    examples: ["Make an Intelligence (Investigation) check to work out how the lock resets."],
  },
  wisdom: {
    summary: "Awareness, intuition and judgment.",
    callFor: ["something is watching from the dark", "a merchant's smile does not reach the eyes", "the trail goes cold"],
    success: "Tell them what they notice and what it probably means.",
    failure: "They notice it too late, or read it wrong; the world acts first.",
    examples: ["Wisdom (Perception): what do you see in the treeline?"],
  },
  charisma: {
    summary: "Presence: persuading, deceiving, performing, intimidating.",
    callFor: ["a guard can be talked past", "a crowd needs to be turned", "a noble has to believe a lie"],
    success: "The other side moves, within reason: they agree, hesitate, or reveal something.",
    failure: "They refuse, raise the price, or remember the face. Never a dead end: offer another way.",
    examples: ["Roll Charisma (Persuasion) to get the captain to delay the hanging."],
  },
};

const SKILL_ADVICE: Record<string, Advice> = {
  acrobatics: { summary: "Staying upright and moving with flair.", callFor: ["ice, rigging or a rolling deck", "a tumble past a foe", "landing from a fall without fuss"], success: "They land on their feet with options open.", failure: "They go down or lose their footing; the next roll may be harder." },
  "animal-handling": { summary: "Calming, reading and guiding animals.", callFor: ["a panicked horse at the cliff edge", "a guard dog that has not decided yet", "a mount pushed past its limits"], success: "The animal settles and cooperates for now.", failure: "It bolts, bites or makes noise; the scene gets messier." },
  arcana: { summary: "Spells, magic items, planes and old sigils.", callFor: ["a glowing circle on the floor", "a magic item's purpose", "a wizard's notes in shorthand"], success: "Name the effect or the school, and one way to deal with it.", failure: "They know what it is, not how it ends, or they trigger it while studying it." },
  athletics: { summary: "Climbing, jumping, swimming, grappling.", callFor: ["a sheer wall with a deadline", "a river in flood", "holding a foe down"], success: "They get there fast and fresh.", failure: "They get there late or tired, or drop something on the way." },
  deception: { summary: "Lies, disguises and misdirection.", callFor: ["a forged letter at the gate", "bluffing a hand of cards", "pretending to belong"], success: "The lie holds, for now. Decide what would break it.", failure: "Doubt creeps in: questions, a follow-up, a watcher sent after them." },
  history: { summary: "Past events, wars, families and ruins.", callFor: ["a ruined keep's coat of arms", "an old treaty", "a legend that may be true"], success: "Give a true and useful piece of the past.", failure: "They recall the popular version, which is wrong in one important way." },
  insight: { summary: "Reading intentions and lies.", callFor: ["a too-generous offer", "a nervous witness", "an ally acting strangely"], success: "Tell them what the other person wants or fears.", failure: "They read the mood but not the reason; they may trust the wrong person." },
  intimidation: { summary: "Threats, menace and pressure.", callFor: ["a thug needs to back down", "an informant is holding out", "a standoff before blades are drawn"], success: "They yield, now. Fear has a memory, though.", failure: "They call the bluff, get angry, or go for help." },
  investigation: { summary: "Searching for clues and making deductions.", callFor: ["a ransacked room", "a trap's trigger", "a ledger with numbers that do not add up"], success: "They find the clue and what it points to.", failure: "They find it, but it takes time, makes noise, or springs something." },
  medicine: { summary: "Stabilizing the dying and diagnosing illness.", callFor: ["a friend at 0 hit points without a healer's kit", "a strange sickness in the village", "how long the body has been dead"], success: "Stabilized, diagnosed, dated: give them a hard fact.", failure: "Time passes without progress; the patient's state is unclear." },
  nature: { summary: "Terrain, plants, weather and beasts.", callFor: ["which berries are safe", "a storm on the horizon", "tracks of something big"], success: "They know what it is and what it means for them.", failure: "They know the common case; this one is different." },
  perception: { summary: "Spotting, hearing and sensing.", callFor: ["an ambush on the road", "a whisper in the next room", "a secret door"], success: "They see it first. Hand them the initiative of the moment.", failure: "They miss it, or see it as it happens. Use passive Perception to avoid asking too often." },
  performance: { summary: "Music, acting, storytelling.", callFor: ["earning a meal at the inn", "distracting a crowd", "a festival contest"], success: "The audience is theirs: coin, attention, or a new admirer.", failure: "Polite silence, a heckler, or a rival who now wants to compete." },
  persuasion: { summary: "Honest appeals, tact and good will.", callFor: ["asking a favour", "negotiating a reward", "calming an angry mob"], success: "They get what they asked for, or a fair counter-offer.", failure: "No, not yet: a condition, a price, or a task first." },
  religion: { summary: "Gods, rites, holy symbols and cults.", callFor: ["an unfamiliar altar", "a cult's hand sign", "an undead's weakness"], success: "Name the faith, its customs, or what the rite is for.", failure: "They know the faith but miss that this is a heresy of it." },
  "sleight-of-hand": { summary: "Palming, pickpocketing, planting.", callFor: ["lifting a key from a belt", "hiding a dagger at the feast", "swapping a gem for paste"], success: "Done, and nobody saw.", failure: "Done, but someone saw; or not done, and nobody saw yet." },
  stealth: { summary: "Moving unseen and unheard.", callFor: ["slipping past sentries", "following someone through a market", "an ambush of their own"], success: "They are where they want to be and unnoticed.", failure: "They are spotted at the worst moment, or must pick: retreat or go loud." },
  survival: { summary: "Tracking, foraging, navigating, enduring.", callFor: ["the trail splits", "food is running out", "a blizzard closes in"], success: "They find the way, the food, or the shelter.", failure: "They lose time or supplies, or arrive somewhere unexpected." },
};

export const playGuide: PlayGuideDef = {
  id: id("guide.checks"),
  title: "Calling for ability checks",
  original: true,
  intro: "Call for a roll only when the outcome is uncertain and both success and failure are interesting. Say the ability (and skill) and the DC (or at least 'easy', 'hard') before the dice land.",
  tips: [
    { text: "No roll when there is no time pressure and no cost to retrying: the character simply succeeds, given enough time." },
    { text: "Failure moves the story too. Let them succeed at a cost, learn something partial, or lose time, rather than ending the scene." },
    { text: "Use passive scores (10 + bonus) for things the characters notice without trying, so players are not asked to roll Perception every room." },
    { text: "Advantage and disadvantage are your quickest dial: give advantage for a good plan or help, disadvantage for bad footing or darkness." },
    { text: "Group checks keep a party moving together: if at least half succeed, the group succeeds." },
    { text: "Skills are a lens on an ability. When a different ability fits the fiction better, pair them: Strength (Intimidation) for a show of force." },
  ],
  groups: ABILITIES.map((a) => ({ id: a.id, label: a.name, summary: ABILITY_ADVICE[a.id]!.summary })),
  entries: [
    ...ABILITIES.map((a): PlayGuideEntry => ({ id: a.id, label: `${a.name} check`, group: a.id, kind: "attribute", roll: `attr:${a.id}`, ...ABILITY_ADVICE[a.id]! })),
    ...SKILLS.map((s): PlayGuideEntry => {
      const advice = SKILL_ADVICE[s.id];
      if (!advice) throw new Error(`no play advice for ${s.id}`);
      return { id: s.id, label: s.name, group: s.ability, kind: "skill", roll: s.id, ...advice };
    }),
  ],
};
