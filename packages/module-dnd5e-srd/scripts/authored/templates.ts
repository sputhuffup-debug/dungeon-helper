/** Original templates (adventures, scenes, checklists), a generic calendar and GM advice cards. */
import type { CalendarDef, RelationshipTypeDef, RuleCard, Template } from "@campaign-forge/module-sdk";
import { id, rule } from "../ids.ts";

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
          pacing: "One short scene of trouble, then a choice of two ways forward.",
          scenes: [
            { purpose: "Open on trouble: an attack, a theft, a plea for help.", mandatory: true },
            { purpose: "A quick social scene to learn what is at stake and who to trust." },
          ],
        },
        {
          number: 2,
          title: "Complications",
          goal: "The obvious plan meets the villain's first step.",
          pacing: "Alternate an exploration scene with one combat; keep each under an hour.",
          scenes: [
            { purpose: "A place to explore with a hazard or a trap and a clue to the finale.", mandatory: true },
            { purpose: "A fight against the villain's minions; let the terrain matter." },
          ],
        },
        {
          number: 3,
          title: "Finale",
          goal: "Face the villain where it matters, with the clock almost out.",
          pacing: "One big encounter with a goal besides killing everything.",
          scenes: [{ purpose: "The showdown, and a minute of epilogue for each character.", mandatory: true }],
        },
      ],
      epilogue: "Tell each player one thing their character changed.",
    },
  },
  {
    id: id("template.lair"),
    kind: "adventure",
    name: "Into the lair",
    description: "A location-based adventure: rumours lead to a lair, the lair pushes back, and the aftermath sets up the next session.",
    mode: ["campaign", "one-shot"],
    original: true,
    scaffold: {
      title: "Into the lair",
      premise: "Something has made its home nearby, and the people next door are paying for it.",
      acts: [
        {
          number: 1,
          title: "Rumours",
          goal: "Learn where the lair is and one thing about its master.",
          scenes: [
            { purpose: "Witnesses disagree about what they saw.", mandatory: true },
            { purpose: "The road there: a wilderness encounter (use the encounter generator)." },
          ],
        },
        {
          number: 2,
          title: "The lair",
          goal: "Get past the guardians, the hazard and the puzzle to the heart of the lair.",
          scenes: [
            { purpose: "Entrance: a guardian or a trap that rewards caution.", mandatory: true },
            { purpose: "A setback or a twist: an unexpected ally, prisoner or rival." },
            { purpose: "The master of the lair, on its own ground.", mandatory: true },
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
    scaffold: { purpose: "Someone has what the party needs and wants something in return.", body: "- What do they want?\n- What will they never agree to?\n- What happens if the talk fails?\n- Which checks fit: Insight, Persuasion, Deception, Intimidation." },
  },
  {
    id: id("template.scene.combat"),
    kind: "scene",
    name: "Combat encounter",
    original: true,
    scaffold: { purpose: "A fight with a reason and a way to end other than death.", body: "- Why are they fighting here, now?\n- Terrain: one feature that offers cover, one that is dangerous.\n- When do the foes flee or surrender?\n- What is the reward for winning, and the cost of losing?" },
  },
  {
    id: id("template.session-checklist"),
    kind: "checklist",
    appliesTo: "session",
    name: "Fifth edition session checklist",
    original: true,
    scaffold: {
      title: "Fifth edition",
      items: [
        { id: id("prep.levels"), phase: "prep", text: "Check each character's level, hit points and spell slots", guidance: "Note who levelled up last time and who ended the session hurt or out of spells." },
        { id: id("prep.monsters"), phase: "prep", text: "Pick monsters for tonight's likely fights", guidance: "Add them from the Reference → Presets list, or roll the encounter generator; check their CR against the party's level." },
        { id: id("prep.names"), phase: "prep", text: "Have three names and one quirk ready", guidance: "Roll the NPC generator once or twice so improvised characters do not all sound alike." },
        { id: id("play.initiative"), phase: "play", text: "Roll initiative for every fight", guidance: "The Initiative tracker rolls d20 plus each sheet's initiative and sorts highest first." },
        { id: id("play.inspiration"), phase: "play", text: "Award inspiration for great roleplay" },
        { id: id("wrap.rest"), phase: "wrap", text: "Note rests taken and resources left", guidance: "Hit dice spent, spell slots used and exhaustion carry into the next session unless they rested." },
        { id: id("wrap.xp"), phase: "wrap", text: "Award experience or a milestone", autoWhen: "awards-given" },
        { id: id("wrap.loot"), phase: "wrap", text: "Record treasure and who carries it" },
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
        { id: "start-level", text: "Starting level and how characters advance (experience or milestones)?", kind: "text", writesTo: "settings.advancement" },
        { id: "options", text: "Which character options are allowed (SRD races and classes only, or more)?", kind: "text", writesTo: "settings.characterOptions" },
        { id: "house-rules", text: "Any house rules (critical hits, resting, encumbrance)?", kind: "text", writesTo: "settings.houseRules" },
        { id: "party-tie", text: "Why does this party stick together?", kind: "text", writesTo: "settings.partyTie" },
        { id: "home", text: "Where does the campaign start?", kind: "entity", writesTo: "settings.startingLocation" },
      ],
    },
  },
];

/** A plain twelve-month calendar with seven-day weeks (names are original). */
export const calendar: CalendarDef = {
  id: id("calendar"),
  name: "Common reckoning",
  defaultYear: 1000,
  months: [
    { name: "Deepwinter", days: 30 },
    { name: "Thawing", days: 30 },
    { name: "Seedtime", days: 30 },
    { name: "Rains", days: 30 },
    { name: "Blossom", days: 30 },
    { name: "Highsun", days: 30 },
    { name: "Midsummer", days: 30 },
    { name: "Harvest", days: 30 },
    { name: "Leaffall", days: 30 },
    { name: "Mists", days: 30 },
    { name: "Frost", days: 30 },
    { name: "Longnight", days: 30 },
  ],
  weekdays: ["Moonday", "Tidesday", "Windsday", "Thunderday", "Fireday", "Starday", "Sunday"],
  format: "{year}-{month:02}-{day:02}",
};

export const relationshipTypes: RelationshipTypeDef[] = [
  { id: id("rival-of"), forward: "rival of", reverse: "rival of", symmetric: true, fromKinds: ["character", "faction", "creature"], toKinds: ["character", "faction", "creature"] },
  { id: id("serves"), forward: "serves", reverse: "served by", fromKinds: ["character", "creature"], toKinds: ["character", "faction", "creature"] },
  { id: id("lairs-in"), forward: "lairs in", reverse: "lair of", fromKinds: ["creature"], toKinds: ["location"] },
];

/** GM advice in our own words (the SRD rules they refer to are linked). */
export const adviceRules: RuleCard[] = [
  {
    id: id("rule.advice.inspiration"),
    title: "Inspiration (GM note)",
    summary: "A simple reward the GM hands out for playing a character's personality, ideals, bonds or flaws well. A character either has inspiration or not; spending it gives advantage on one attack roll, saving throw or ability check. Track it on the sheet or with the Inspiration tracker.",
    original: true,
    tags: ["gm advice"],
    links: { trackers: [id("tracker.inspiration")], rules: [rule("advantage-and-disadvantage")] },
  },
  {
    id: id("rule.advice.calling-for-checks"),
    title: "Calling for checks (GM advice)",
    summary: "Ask for a roll only when the result is uncertain and matters. Name the ability and skill, set the DC (10 easy, 15 medium, 20 hard), and decide before the roll what failure costs. The play guide in table mode lists cues for every skill.",
    original: true,
    tags: ["gm advice"],
    links: { rules: [rule("ability-checks"), rule("ability-checks.typical-difficulty-classes"), rule("advantage-and-disadvantage")] },
  },
  {
    id: id("rule.advice.encounters"),
    title: "Building encounters (GM advice)",
    summary: "The encounter generator is a starting point, not a balance formula: it picks SRD monsters whose challenge rating suits the party's level band and the terrain. Adjust numbers to the party's size and resources, and give every fight a reason, a place that matters and a way out.",
    original: true,
    tags: ["gm advice"],
    links: { tables: [id("encounter.activity")] },
  },
];
