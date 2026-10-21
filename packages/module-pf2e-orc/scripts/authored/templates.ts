/**
 * Original templates (adventures, scenes, checklists), an original calendar,
 * relationship types, the basic reference lists the sheets use (attributes,
 * skills, Perception and saves, proficiency ranks), and rule cards: GM advice
 * in our own words, and short summaries of core rules (proficiency, degrees
 * of success, Bulk, encounter budgets, DCs) cited by book and section.
 */
import type { CalendarDef, ReferenceList, RelationshipTypeDef, RuleCard, Template } from "@campaign-forge/module-sdk";
import { ATTRIBUTES, cite, id, LIST, RANKS, rule, SAVES, SKILLS } from "../ids.ts";
import { CREATURE_XP, THREAT_BUDGETS } from "./entityTypes.ts";
import { BUILDING_ENCOUNTERS } from "./tables.ts";

export const templates: Template[] = [
  {
    id: id("template.one-shot"),
    kind: "adventure",
    name: "One-shot in three acts",
    description: "A single evening: a hook that starts in motion, a middle that complicates it, and a finale with a clear win or loss.",
    mode: ["one-shot"],
    original: true,
    scaffold: {
      title: "One-shot",
      premise: "Who needs help, what goes wrong if nobody acts, and why tonight?",
      playerIntro: "Start mid-scene: the characters already know each other and already have a reason to act.",
      gmSituation: "Write the villain's plan in three steps; each act the party fails to stop one, the next one happens.",
      acts: [
        {
          number: 1,
          title: "The hook",
          goal: "Get the party moving within ten minutes of play.",
          pacing: "One short encounter (a low threat), then a choice of two ways forward.",
          scenes: [
            { purpose: "Open on trouble: an attack, a theft, a plea for help.", mandatory: true },
            { purpose: "A quick social scene to learn what is at stake and who to trust." },
          ],
        },
        {
          number: 2,
          title: "Complications",
          goal: "The obvious plan meets the villain's first step.",
          pacing: "Alternate exploration with one moderate encounter; keep each under an hour.",
          scenes: [
            { purpose: "A place to explore with a hazard and a clue to the finale.", mandatory: true },
            { purpose: "A fight against the villain's minions; let the terrain matter." },
          ],
        },
        {
          number: 3,
          title: "Finale",
          goal: "Face the villain where it matters, with the clock almost out.",
          pacing: "One severe encounter with a goal besides defeating everything.",
          scenes: [{ purpose: "The showdown, and a minute of epilogue for each character.", mandatory: true }],
        },
      ],
      epilogue: "Tell each player one thing their character changed.",
    },
  },
  {
    id: id("template.delve"),
    kind: "adventure",
    name: "A short delve",
    description: "A location-based adventure: rumours lead to a lair, the lair pushes back with creatures and hazards, the aftermath sets up the next session.",
    mode: ["campaign", "one-shot"],
    original: true,
    scaffold: {
      title: "A short delve",
      premise: "Something has made its home nearby, and the people next door are paying for it.",
      acts: [
        {
          number: 1,
          title: "Rumours",
          goal: "Learn where the lair is and one thing about its master.",
          scenes: [
            { purpose: "Witnesses disagree about what they saw (Recall Knowledge and Diplomacy).", mandatory: true },
            { purpose: "The road there: a low-threat encounter from the encounter builder." },
          ],
        },
        {
          number: 2,
          title: "The lair",
          goal: "Get past a hazard, a guardian and a puzzle to the heart of the lair.",
          scenes: [
            { purpose: "Entrance: a simple hazard that rewards Searching.", mandatory: true },
            { purpose: "A setback or a twist: an unexpected ally, prisoner or rival." },
            { purpose: "The master of the lair, on its own ground (a severe threat).", mandatory: true },
          ],
        },
        { number: 3, title: "Aftermath", goal: "Treasure, consequences and a new rumour.", scenes: [{ purpose: "Return to the people who suffered; something has changed while they were away." }] },
      ],
    },
  },
  {
    id: id("template.scene.social"),
    kind: "scene",
    name: "Social encounter",
    original: true,
    scaffold: { purpose: "Someone has what the party needs and wants something in return.", body: "- Their attitude now (hostile to helpful), and what would move it one step.\n- What will they never agree to?\n- What happens if the talk fails?\n- Which checks fit: Perception (Sense Motive), Diplomacy, Deception, Intimidation, a Lore." },
  },
  {
    id: id("template.scene.combat"),
    kind: "scene",
    name: "Combat encounter",
    original: true,
    scaffold: { purpose: "A fight with a reason and a way to end other than death.", body: "- Threat and XP budget for this party (use the encounter builder).\n- Terrain: one feature that offers cover, one that is difficult or hazardous.\n- When do the foes flee or surrender?\n- What is the reward for winning, and the cost of losing?" },
  },
  {
    id: id("template.scene.hazard"),
    kind: "scene",
    name: "Hazard",
    original: true,
    scaffold: { purpose: "A trap or a dangerous place that tests the party's caution.", body: "- Stealth DC to notice it, and who is Searching.\n- How to disable it, and which skill and proficiency it needs.\n- What it does when triggered, and whether it rolls initiative (a complex hazard).\n- What a clever party can do instead of disabling it." },
  },
  {
    id: id("template.session-checklist"),
    kind: "checklist",
    appliesTo: "session",
    name: "Remaster session checklist",
    original: true,
    scaffold: {
      title: "Remaster d20",
      items: [
        { id: id("prep.levels"), phase: "prep", text: "Check each character's level, Hit Points, Focus Points and spell slots", guidance: "Note who levelled up, who ended the session wounded, and who spent their Hero Points." },
        { id: id("prep.encounters"), phase: "prep", text: "Budget tonight's encounters", guidance: "Use the encounter builder: pick the threat (low for warm-ups, moderate for most fights, severe for a boss) and the party's level and size." },
        { id: id("prep.names"), phase: "prep", text: "Have three names and one quirk ready", guidance: "Roll the NPC generator once or twice so improvised characters do not all sound alike." },
        { id: id("play.hero-points"), phase: "play", text: "Give each character 1 Hero Point at the start, more for heroics", guidance: "The Hero Points tracker keeps count; a character can hold up to 3." },
        { id: id("play.initiative"), phase: "play", text: "Roll initiative for every fight", guidance: "The Initiative tracker rolls d20 plus Perception (or the skill a character was using) and sorts highest first." },
        { id: id("wrap.conditions"), phase: "wrap", text: "Clear conditions and note wounded and doomed values", guidance: "Wounded goes away with a full rest or Treat Wounds; doomed drops by 1 after a full night's rest." },
        { id: id("wrap.xp"), phase: "wrap", text: "Award experience points", autoWhen: "awards-given", guidance: "A character levels up at 1,000 XP and keeps the rest." },
        { id: id("wrap.loot"), phase: "wrap", text: "Record treasure and who carries it (and their Bulk)" },
      ],
    },
  },
  {
    id: id("template.session-zero"),
    kind: "checklist",
    appliesTo: "session-zero",
    name: "Session zero",
    description: "Settle expectations before the first session; answers go into campaign settings.",
    original: true,
    scaffold: {
      title: "Session zero",
      items: [
        { id: "tone", text: "What tone are we going for?", kind: "choice", options: ["heroic", "gritty", "lighthearted", "horror"], writesTo: "settings.tone" },
        { id: "limits", text: "Which topics are off the table, and which should fade to black?", kind: "text", writesTo: "settings.contentLimits" },
        { id: "start-level", text: "Starting level, and experience or milestone advancement?", kind: "text", writesTo: "settings.advancement" },
        { id: "options", text: "Which character options are allowed (common only, or uncommon with a reason)?", kind: "text", writesTo: "settings.characterOptions" },
        { id: "variants", text: "Any variant or house rules (free archetype, automatic bonuses, critical cards)?", kind: "text", writesTo: "settings.houseRules" },
        { id: "party-tie", text: "Why does this party stick together?", kind: "text", writesTo: "settings.partyTie" },
        { id: "home", text: "Where does the campaign start?", kind: "entity", writesTo: "settings.startingLocation" },
      ],
    },
  },
];

/** An original twelve-month calendar with seven-day weeks. */
export const calendar: CalendarDef = {
  id: id("calendar"),
  name: "Hearth reckoning",
  defaultYear: 812,
  months: [
    { name: "Frostwane", days: 30 },
    { name: "Thawmonth", days: 30 },
    { name: "Sowing", days: 30 },
    { name: "Bloom", days: 30 },
    { name: "Greening", days: 30 },
    { name: "Longsun", days: 30 },
    { name: "Haymaking", days: 30 },
    { name: "Reaping", days: 30 },
    { name: "Gleaning", days: 30 },
    { name: "Leafturn", days: 30 },
    { name: "Mistfall", days: 30 },
    { name: "Deepdark", days: 30 },
  ],
  weekdays: ["Firstday", "Seedday", "Wellday", "Hearthday", "Marketday", "Highday", "Restday"],
  format: "{year}-{month:02}-{day:02}",
};

export const relationshipTypes: RelationshipTypeDef[] = [
  { id: id("rival-of"), forward: "rival of", reverse: "rival of", symmetric: true, fromKinds: ["character", "faction", "creature"], toKinds: ["character", "faction", "creature"] },
  { id: id("serves"), forward: "serves", reverse: "served by", fromKinds: ["character", "creature"], toKinds: ["character", "faction", "creature"] },
  { id: id("lairs-in"), forward: "lairs in", reverse: "lair of", fromKinds: ["creature"], toKinds: ["location"] },
  { id: id("guards"), forward: "guards", reverse: "guarded by", fromKinds: ["creature"], toKinds: ["location", "item"] },
];

/** The lists the sheets use: attributes, skills, Perception and saves, proficiency ranks. */
export const basicLists: ReferenceList[] = [
  {
    id: LIST.attributes,
    name: "Attributes",
    cite: cite("Player Core", "Attributes"),
    columns: ["abbr", "summary"],
    items: ATTRIBUTES.map((a) => ({
      id: a.id,
      name: a.name,
      abbr: a.abbr,
      summary: {
        strength: "Physical power: melee damage, Athletics, carrying Bulk.",
        dexterity: "Agility and aim: AC (up to the armor's cap), Reflex saves, ranged attacks, Acrobatics, Stealth, Thievery.",
        constitution: "Health and stamina: Hit Points per level, Fortitude saves.",
        intelligence: "Reasoning: trained skills and languages, Arcana, Crafting, Occultism, Society, Lore.",
        wisdom: "Awareness and intuition: Perception, Will saves, Medicine, Nature, Religion, Survival.",
        charisma: "Force of personality: Deception, Diplomacy, Intimidation, Performance.",
      }[a.id],
    })),
  },
  {
    id: LIST.skills,
    name: "Skills",
    cite: cite("Player Core", "Skills"),
    columns: ["attribute"],
    items: SKILLS.map((s) => ({ id: s.id, name: s.name, attribute: s.attribute })),
  },
  {
    id: LIST.saves,
    name: "Perception and saving throws",
    cite: cite("Player Core", "Perception and Saving Throws"),
    columns: ["attribute"],
    items: SAVES.map((s) => ({ id: s.id, name: s.name, attribute: s.attribute })),
  },
  {
    id: LIST.ranks,
    name: "Proficiency ranks",
    cite: cite("Player Core", "Proficiency"),
    columns: ["value", "bonus"],
    items: RANKS.map((r) => ({ id: r.label.toLowerCase(), name: r.label, value: r.value, bonus: r.value === 0 ? "+0" : `level + ${r.value * 2}` })),
  },
];

const budgetTable = [
  "| Threat | XP budget | Each character beyond four |",
  "| --- | --- | --- |",
  ...Object.entries(THREAT_BUDGETS).map(([k, b]) => `| ${k.charAt(0).toUpperCase() + k.slice(1)} | ${b.budget} | ${b.perCharacter} |`),
].join("\n");
const xpTable = ["| Creature level | XP |", "| --- | --- |", ...Object.entries(CREATURE_XP).map(([k, xp]) => `| Party level ${Number(k) === 0 ? "" : Number(k) > 0 ? `+${k}` : `−${Math.abs(Number(k))}`} | ${xp} |`)].join("\n");
/** DCs by level (GM Core, Difficulty Classes). */
export const DC_BY_LEVEL = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const dcTable = ["| Level | DC | Level | DC |", "| --- | --- | --- | --- |", ...Array.from({ length: 13 }, (_, i) => `| ${i} | ${DC_BY_LEVEL[i]} | ${i + 13} | ${DC_BY_LEVEL[i + 13]} |`)].join("\n");

/** GM advice (original) and short rules summaries (cited). */
export const adviceRules: RuleCard[] = [
  {
    id: rule("advice.degrees-of-success"),
    title: "Degrees of success",
    summary:
      "Every check has four possible results. Meet or beat the DC for a **success**; beat it by 10 or more for a **critical success**. Miss it for a **failure**; miss it by 10 or more for a **critical failure**. Then a natural 20 improves the result one step and a natural 1 worsens it one step. The dice roller reads rolls this way when you give it a DC.",
    cite: cite("Player Core", "Checks", "Degrees of Success"),
    tags: ["core rules"],
    links: { rules: [rule("advice.dcs")] },
  },
  {
    id: rule("advice.proficiency"),
    title: "Proficiency",
    summary:
      "A check adds an attribute modifier and a proficiency bonus. Untrained adds nothing; trained, expert, master and legendary add the character's level plus 2, 4, 6 or 8. The sheet stores each rank and works out every total.",
    cite: cite("Player Core", "Proficiency"),
    tags: ["core rules"],
  },
  {
    id: rule("advice.attributes"),
    title: "Attribute modifiers",
    summary: "The remastered rules write attribute modifiers down directly (usually from −1 to +4 at 1st level, up to +7 later) instead of scores. A boost adds 1 and a flaw subtracts 1; at +4 or more, a level-up boost counts as half until a second one makes it a full point. Every check, DC and Hit Point total on the sheet reads these modifiers.",
    original: true,
    tags: ["gm advice"],
  },
  {
    id: rule("advice.armor-class"),
    title: "Armor Class",
    summary: "AC is 10 + Dexterity modifier (no higher than the armor's Dexterity cap) + proficiency in the armor's category + the armor's item bonus (and potency rune). Raising a shield adds its circumstance bonus until your next turn.",
    cite: cite("Player Core", "Armor Class"),
    tags: ["core rules"],
    links: { rules: [rule("action.raise-a-shield")] },
  },
  {
    id: rule("advice.hit-points"),
    title: "Hit Points",
    summary: "Maximum Hit Points are the ancestry's Hit Points plus, at each level, the class's Hit Points + Constitution modifier. At 0 Hit Points a character falls unconscious and gains the dying condition (dying 1, or more after a critical hit), increased by their wounded value.",
    cite: cite("Player Core", "Hit Points, Healing, and Dying"),
    tags: ["core rules"],
    links: { rules: [rule("condition.dying"), rule("condition.wounded")], trackers: [id("tracker.hp"), id("tracker.dying")] },
  },
  {
    id: rule("advice.hero-points"),
    title: "Hero Points",
    summary: "Each character starts a session with 1 Hero Point and can hold up to 3. Spend 1 to reroll a check and use the second result (a fortune effect), or all of them to avoid death: lose the dying condition and stabilize at 0 Hit Points. Award more for heroics and great play.",
    cite: cite("Player Core", "Hero Points"),
    tags: ["core rules"],
    links: { trackers: [id("tracker.hero-points")] },
  },
  {
    id: rule("advice.bulk"),
    title: "Bulk",
    summary: "Ten light items make 1 Bulk (drop the fractions); negligible items do not count. A character is encumbered when carrying more than 5 + Strength modifier Bulk, and cannot carry more than 10 + Strength modifier. The sheet totals the inventory with light written as 0.1.",
    cite: cite("Player Core", "Bulk"),
    tags: ["core rules"],
    links: { rules: [rule("condition.encumbered")] },
  },
  {
    id: rule("advice.initiative"),
    title: "Initiative and rounds",
    summary: "At the start of an encounter everyone rolls initiative, usually Perception; a character who was sneaking rolls Stealth, one who was talking rolls Deception or Diplomacy. Turns go from highest to lowest; a round is about 6 seconds. Each turn a creature gets 3 actions and 1 reaction.",
    cite: cite("Player Core", "Encounter Mode", "Initiative"),
    tags: ["core rules"],
    links: { trackers: [id("tracker.initiative"), id("tracker.clock")] },
  },
  {
    id: rule("advice.multiple-attack-penalty"),
    title: "Multiple attack penalty",
    summary: "The second attack on a turn takes −5 and any later attack −10; with an agile weapon the penalties are −4 and −8. Pick the attack in the dice roller's Attack option; creature stat blocks list the three bonuses (e.g. +7 [+3/−1]).",
    cite: cite("Player Core", "Encounter Mode", "Multiple Attack Penalty"),
    tags: ["core rules"],
    links: { rules: [rule("action.strike")] },
  },
  {
    id: rule("advice.encounter-budget"),
    title: "Encounter budgets",
    summary: `Spend an XP budget on creatures by their level relative to the party. For four characters:\n\n${budgetTable}\n\nEach creature costs XP by its level:\n\n${xpTable}\n\nThe encounter builder spends these budgets on Monster Core creatures; an encounter's sheet shows its budget for the party's size and threat.`,
    cite: BUILDING_ENCOUNTERS,
    tags: ["core rules", "gm advice"],
  },
  {
    id: rule("advice.dcs"),
    title: "Difficulty Classes",
    summary: `Simple DCs by the proficiency a task calls for: untrained 10, trained 15, expert 20, master 30, legendary 40. For a challenge tied to a level, use the DC by level:\n\n${dcTable}\n\nAdjust for difficulty: incredibly easy −10, very easy −5, easy −2, hard +2, very hard +5, incredibly hard +10.`,
    cite: cite("GM Core", "Difficulty Classes"),
    tags: ["core rules", "gm advice"],
  },
  {
    id: rule("advice.calling-for-checks"),
    title: "Calling for checks (GM advice)",
    summary: "Ask for a roll only when the result is uncertain and matters. Name the skill and set the DC before the roll, and decide what each of the four results means: a critical success should feel like more than a success, a critical failure should cost something. The play guide in table mode lists cues for every skill and save.",
    original: true,
    tags: ["gm advice"],
    links: { rules: [rule("advice.degrees-of-success"), rule("advice.dcs")] },
  },
];
