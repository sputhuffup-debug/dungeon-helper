/**
 * Original GM tables and generators (written for Campaign Forge):
 *
 * - an encounter builder that spends GM Core's XP budget for the threat and
 *   party size on Monster Core creatures, by level relative to the party;
 * - NPC, settlement and tavern, treasure-hoard flavour and weather tables in
 *   our own words.
 *
 * The XP numbers (budgets, the adjustment per character, XP per creature by
 * level difference) are GM Core's encounter-building rules, cited; which
 * creature combinations a budget buys is our own enumeration of them.
 */
import type { EntityPreset, PackProcedure, RollTable } from "@campaign-forge/module-sdk";
import { cite, ENCOUNTER, id, LOCATION, NPC, QUEST } from "../ids.ts";
import { CREATURE_XP, THREAT_BUDGETS } from "./entityTypes.ts";
import { add, cat, ifs, max, min, v, type Rule } from "./logic.ts";

export const BUILDING_ENCOUNTERS = cite("GM Core", "Building Encounters");
/** Monster Core's creature levels run from −1 to 21 (the level-25 unique creature is Reserved Material). */
export const LEVEL_MIN = -1;
export const LEVEL_MAX = 21;
export const PARTY_SIZES = [2, 3, 4, 5, 6, 7, 8];

/** A group of identical creatures: level relative to the party, how many. */
export interface Group {
  offset: number;
  n: number;
}

/** Every budget a threat and a party of 2 to 8 can have. */
export function budgets(): number[] {
  const set = new Set<number>();
  for (const t of Object.values(THREAT_BUDGETS)) for (const n of PARTY_SIZES) set.add(t.budget + (n - 4) * t.perCharacter);
  return [...set].sort((a, b) => a - b);
}

const xpOf = (g: Group) => CREATURE_XP[String(g.offset)]! * g.n;
const describe = (g: Group) => `${g.n} × ${g.offset === 0 ? "party level" : `party level ${g.offset > 0 ? "+" : "−"}${Math.abs(g.offset)}`}`;

/**
 * Creature groups that spend a budget exactly: one to three groups, at most
 * eight creatures, no two groups at the same level. Favours shapes a GM
 * would build (a boss and minions, a pair, a pack), deterministic order.
 */
export function shapesFor(budget: number): Group[][] {
  const offsets = [4, 3, 2, 1, 0, -1, -2, -3, -4];
  const out: Group[][] = [];
  const total = (gs: Group[]) => gs.reduce((s, g) => s + xpOf(g), 0);
  const count = (gs: Group[]) => gs.reduce((s, g) => s + g.n, 0);
  const consider = (gs: Group[]) => {
    if (total(gs) === budget && count(gs) <= 8) out.push(gs);
  };
  for (const a of offsets) for (let na = 1; na <= 6; na++) {
    consider([{ offset: a, n: na }]);
    for (const b of offsets) if (b < a) for (let nb = 1; nb <= 6; nb++) {
      consider([{ offset: a, n: na }, { offset: b, n: nb }]);
      for (const c of offsets) if (c < b) for (let nc = 1; nc <= 4; nc++) consider([{ offset: a, n: na }, { offset: b, n: nb }, { offset: c, n: nc }]);
    }
  }
  // Prefer fewer groups and a moderate number of creatures; keep at most 12 shapes.
  const score = (gs: Group[]) => gs.length * 10 + Math.abs(count(gs) - 3) * 3 + (gs[0]!.offset > 3 ? 4 : 0) + (gs.some((g) => g.offset < -3) ? 6 : 0);
  return out.sort((x, y) => score(x) - score(y) || JSON.stringify(x).localeCompare(JSON.stringify(y))).slice(0, 12);
}

function shapeTables(): RollTable[] {
  return budgets().map((b) => {
    const shapes = shapesFor(b);
    if (shapes.length === 0) throw new Error(`no creature combination spends ${b} XP`);
    return {
      id: id(`encounter.budget-${b}`),
      name: `Encounter shape (${b} XP)`,
      family: "encounter",
      cite: BUILDING_ENCOUNTERS,
      dice: `1d${shapes.length}`,
      notes: "Creature groups whose XP adds up to the budget exactly (XP per creature by its level relative to the party's, from GM Core). The groups are our own enumeration.",
      rows: shapes.map((gs, i) => ({
        range: [i + 1, i + 1] as [number, number],
        label: gs.map(describe).join(", "),
        result: Object.fromEntries(gs.flatMap((g, k) => [[`o${k + 1}`, g.offset], [`n${k + 1}`, g.n]])) as Record<string, number>,
      })),
    };
  });
}

/** One table per creature level: every Monster Core creature of that level. */
function creatureTables(presets: EntityPreset[]): RollTable[] {
  const tables: RollTable[] = [];
  for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
    const at = presets.filter((p) => p.fields.level === level).sort((a, b) => a.name.localeCompare(b.name));
    if (at.length === 0) throw new Error(`no Monster Core creature of level ${level}`);
    if (level === LEVEL_MAX && presets.some((p) => Number(p.fields.level) > LEVEL_MAX)) throw new Error("creatures above LEVEL_MAX: raise it");
    tables.push({
      id: id(`creature.level-${level}`),
      name: `Creatures of level ${level}`,
      family: "creature",
      cite: cite("Monster Core", "Creatures by Level"),
      dice: `1d${at.length}`,
      rows: at.map((p, i) => ({ range: [i + 1, i + 1] as [number, number], label: p.name, result: { preset: p.id, name: p.name, level } })),
    });
  }
  return tables;
}

/** A table from a list of results, one die face each. */
function simple(tableId: string, name: string, labels: string[], key = "text"): RollTable {
  return {
    id: id(tableId),
    name,
    family: tableId.split(".")[0]!,
    original: true,
    dice: `1d${labels.length}`,
    rows: labels.map((label, i) => ({ range: [i + 1, i + 1] as [number, number], label, result: { [key]: label } })),
  };
}

const OCCUPATIONS: Array<[string, string]> = [
  ["Innkeeper", "Dwarf Warrior"],
  ["Watch sergeant", "Halfling Street Watcher"],
  ["Temple warden", "Lawbringer Warpriest"],
  ["Hedge mage", "Dhampir Wizard"],
  ["Smuggler", "Goblin Commando"],
  ["Retired soldier", "Orc Veteran"],
  ["Mercenary captain", "Orc Commander"],
  ["Ranger of the borderlands", "Elf Ranger"],
  ["Herbalist", "Centaur Herbalist"],
  ["Stonemason", "Dwarf Stonecaster"],
  ["Street musician", "Gnome Bard"],
  ["Pickpocket", "Halfling Troublemaker"],
  ["Tracker", "Kholo Hunter"],
  ["Scout for hire", "Kobold Scout"],
  ["Bounty hunter", "Hobgoblin Archer"],
  ["Sailor", "Merfolk Warrior"],
  ["Fortune-teller", "Lizardfolk Stargazer"],
  ["Bodyguard", "Dwarf Warrior"],
  ["Ghost hunter", "Duskwalker Ghost Hunter"],
  ["Alchemist's assistant", "Ratfolk Grenadier"],
];

const ANCESTRY_ROWS: Array<[number, number, string]> = [
  [1, 6, "Human"],
  [7, 8, "Dwarf"],
  [9, 10, "Elf"],
  [11, 12, "Halfling"],
  [13, 13, "Gnome"],
  [14, 14, "Goblin"],
  [15, 15, "Orc"],
  [16, 16, "Catfolk"],
  [17, 17, "Kobold"],
  [18, 18, "Ratfolk"],
  [19, 19, "Tengu"],
  [20, 20, "Leshy"],
];

export function originalTables(presets: EntityPreset[]): RollTable[] {
  const names = new Set(presets.map((p) => p.name));
  for (const [, block] of OCCUPATIONS) if (!names.has(block)) throw new Error(`occupation stat block ${block} is not a Monster Core creature`);
  const presetOf = new Map(presets.map((p) => [p.name, p.id]));
  return [
    ...shapeTables(),
    ...creatureTables(presets),
    simple("encounter.activity", "What they are doing", [
      "Feeding, and in no mood to share",
      "Resting, with one lookout half awake",
      "Squabbling over a prize",
      "Guarding something they were told to guard",
      "Fleeing from something worse",
      "Lost, and arguing about it",
      "Laying an ambush on the path ahead",
      "Wounded, and more dangerous for it",
      "Escorting a captive",
      "Searching for something they dropped",
    ], "label"),
    simple("encounter.twist", "Encounter twist", [
      "Fog rolls in: everything beyond 30 feet is concealed",
      "A third party arrives in the second round",
      "One of them wants out and will bargain",
      "The ground is unstable: difficult terrain spreads each round",
      "They carry a clue to the current quest",
      "Their leader is not what it seems",
      "They are compelled by someone else's magic",
      "A captive among them shouts for help",
      "They mistake the party for someone else",
      "Reinforcements are three rounds away",
      "They already fought someone today and are hurt",
      "Something valuable burns, sinks or breaks if the fight drags on",
    ], "label"),
    {
      id: id("npc.occupation"),
      name: "NPC occupation",
      family: "npc",
      original: true,
      dice: "1d20",
      notes: "Each occupation suggests a Monster Core stat block in case it comes to a fight.",
      rows: OCCUPATIONS.map(([job, block], i) => ({ range: [i + 1, i + 1] as [number, number], label: job, result: { occupation: job, statBlock: block, preset: presetOf.get(block)! } })),
    },
    {
      id: id("npc.ancestry"),
      name: "NPC ancestry",
      family: "npc",
      original: true,
      dice: "1d20",
      rows: ANCESTRY_ROWS.map(([a, b, name]) => ({ range: [a, b] as [number, number], label: name, result: { ancestry: name } })),
    },
    simple("npc.first-name", "First name", ["Aldo", "Brisa", "Cael", "Dorran", "Esk", "Fiora", "Gannet", "Hollis", "Ilse", "Jory", "Kestrel", "Lio", "Marrow", "Nell", "Oswin", "Pim", "Quen", "Rook", "Sable", "Tamsin"], "name"),
    simple("npc.family-name", "Family name", ["Applewhite", "Barrowman", "Cinder", "Dunlin", "Eskew", "Fallowmere", "Greaves", "Harrowgate", "Ingle", "Juniper", "Kettlewell", "Larkspur", "Millward", "Nettles", "Orchard", "Pennywhistle", "Quillon", "Rushlight", "Saltmarsh", "Tallow"], "name"),
    simple("npc.quirk", "NPC quirk", [
      "Whistles through a gap in their teeth when nervous",
      "Collects bird feathers and names each one",
      "Never sits with their back to a window",
      "Repeats the last word of every question before answering",
      "Laughs at funerals and cries at weddings",
      "Counts coins three times, then once more",
      "Smells of a spice nobody can place",
      "Answers questions with questions",
      "Carries a lizard in a coat pocket",
      "Sketches everyone they meet, badly",
      "Mispronounces one common word, proudly",
      "Keeps a written list of grudges",
      "Superstitious about doorways",
      "Unfailingly polite, even to enemies",
      "Eats something during every conversation",
      "Quotes a mentor's sayings, often wrongly",
      "Wears far too many rings",
      "Whispers when saying anything important",
      "Cannot resist a wager",
      "Polishes a dented locket when thinking",
    ]),
    simple("npc.motivation", "What they want", [
      "Money to pay a debt to the wrong people",
      "Revenge on someone the party may know",
      "To keep a younger sibling out of trouble",
      "Respect from the people who laughed at them",
      "To leave town and never come back",
      "A cure for a sick friend",
      "Proof that an old rumour is true",
      "The deed to a piece of land",
      "Forgiveness for an old mistake",
      "To be left alone",
      "Power over a rival",
      "To find someone who went missing",
    ]),
    simple("npc.secret", "Their secret", [
      "Works for the people the party is hunting",
      "Is not who they claim to be",
      "Saw the crime and said nothing",
      "Owes money to a dangerous patron",
      "Carries a magic item they cannot control",
      "Is in love with someone they must not love",
      "Buried something valuable nearby",
      "Is being blackmailed",
      "Once served the villain",
      "Knows a hidden way in",
      "Has a price on their head in another city",
      "Has no secret, and is suspected anyway",
    ]),
    simple("npc.voice", "Voice and manner", [
      "Slow and careful, every word weighed",
      "Loud, cheerful, stands too close",
      "Clipped and impatient",
      "Soft-spoken; you lean in to hear",
      "Theatrical, with big gestures",
      "Nervous, trails off mid-sentence",
      "Deadpan; impossible to tell if joking",
      "Sing-song, with a strong accent",
      "Gravelly, punctuated by coughs",
      "Warm, calls everyone 'friend'",
    ]),
    simple("settlement.name-start", "Settlement name (start)", ["Amber", "Brack", "Cinder", "Dusk", "Elm", "Flint", "Gull", "Heron", "Ivy", "Kestrel", "Lantern", "Marsh", "Nettle", "Owl", "Pike", "Quarry", "Rush", "Sorrel", "Thistle", "Willow"], "name"),
    simple("settlement.name-end", "Settlement name (end)", ["bank", "brook", "bury", "combe", "cross", "dale", "fell", "ford", "gate", "haven", "hithe", "holt", "mere", "moor", "reach", "stead", "ton", "watch", "well", "wick"], "name"),
    {
      id: id("settlement.size"),
      name: "Settlement size",
      family: "settlement",
      original: true,
      dice: "1d6",
      rows: [
        { range: [1, 2], label: "Hamlet", result: { size: "hamlet", population: "a few dozen", level: 0 } },
        { range: [3, 4], label: "Village", result: { size: "village", population: "a few hundred", level: 1 } },
        { range: [5, 5], label: "Town", result: { size: "town", population: "a few thousand", level: 3 } },
        { range: [6, 6], label: "City", result: { size: "city", population: "tens of thousands", level: 7 } },
      ],
    },
    simple("settlement.feature", "Notable feature", [
      "A bridge older than anyone remembers",
      "A market that never quite closes",
      "A bell tower with a cracked bell",
      "Walls half built and abandoned",
      "A tower nobody enters",
      "A brewery everyone argues about",
      "Hot springs under the square",
      "A great tree the town grew around",
      "An overgrown battlefield at the edge of town",
      "A ferry run by one stubborn family",
      "Statues of a forgotten hero",
      "A mine that just reopened",
    ]),
    simple("settlement.trouble", "Local trouble", [
      "Livestock vanish at night",
      "The well has turned bitter",
      "Two families are close to open feud",
      "A tax collector demands double",
      "Strangers have taken over the old mill",
      "Children hear a voice in the woods",
      "A sickness spreads from the docks",
      "The council's heir is missing",
      "Bandits demand a toll on the only road",
      "Graves are found opened",
      "The harvest is failing for no clear reason",
      "An alchemist's experiment has escaped",
    ]),
    simple("tavern.name-first", "Tavern name (first word)", ["Brass", "Crooked", "Drowsy", "Gilded", "Hollow", "Jolly", "Lame", "Lucky", "Merry", "Muddy", "Painted", "Prancing", "Rusty", "Salty", "Silver", "Sleepy", "Stubborn", "Tipsy", "Wandering", "Wicked"], "name"),
    simple("tavern.name-second", "Tavern name (second word)", ["Anchor", "Badger", "Barrel", "Bell", "Boar", "Cauldron", "Crow", "Ferret", "Fiddle", "Goose", "Hare", "Kettle", "Lantern", "Mule", "Otter", "Pony", "Stag", "Tankard", "Toad", "Wheel"], "name"),
    simple("tavern.special", "House speciality", [
      "Pepper stew that makes strong folk weep",
      "Dark ale brewed with honey",
      "Fish pies, fresh every morning",
      "A cider that is mostly rumour",
      "Roast fowl with a burnt-sugar glaze",
      "Hard cheese from the owner's own goats",
      "Mulled wine and card games",
      "Open-stage night: anyone may sing, everyone must listen",
      "A back room for private talk",
      "The cheapest beds in the region, for a reason",
    ]),
    simple("treasure.hoard", "What the hoard looks like", [
      "Coins spilled from a rotted chest, sticky with old wine",
      "A neat stack of trade bars wrapped in oilcloth",
      "Gems sewn into the lining of a moth-eaten cloak",
      "A locked strongbox with the key still in it",
      "A pile of mismatched cutlery, some of it silver",
      "Coins hidden inside hollowed-out books",
      "A sack of copper and one gold coin from somewhere very old",
      "Jewellery tangled into a single glittering knot",
      "A carved idol with a removable head full of coins",
      "Payment ledgers worth more than the coins beside them",
      "A shrine offering bowl, heaped high",
      "A dragon's-worth of copper and nothing else",
    ]),
    simple("treasure.trinket", "Trinket", [
      "A brass key with no teeth",
      "A tin soldier painted in unfamiliar colours",
      "A pressed flower inside a folded letter",
      "A wooden whistle that makes no sound",
      "A glass marble with a bubble trapped inside",
      "A child's drawing of a wyvern",
      "A ring of braided horsehair",
      "A die with two sixes and no one",
      "A thimble engraved with initials",
      "A mirror shard that fogs when nobody breathes on it",
      "A pouch of seeds labelled 'do not plant'",
      "A map of a town that does not exist",
      "A tooth set in silver",
      "A small bell with the clapper removed",
      "A playing card with the face scratched out",
      "A carved bone fish",
      "A lock of grey hair tied with ribbon",
      "A wax seal with an unknown crest",
      "A spoon bent into a perfect circle",
      "A smooth black stone that is always warm",
    ]),
    simple("travel.weather", "Weather on the road", [
      "Clear and bright",
      "Clear and bitterly cold",
      "Overcast and still",
      "Light rain all day",
      "Heavy rain; roads turn to mud (difficult terrain off the road)",
      "Thick fog until midday",
      "Strong wind from the hills",
      "Thunderstorm in the afternoon",
      "Hot and humid",
      "Sleet or snow, depending on the season",
      "A sudden hailstorm",
      "Perfect travelling weather; something feels wrong",
    ]),
  ];
}

const clampLevel = (x: Rule): Rule => max(LEVEL_MIN, min(LEVEL_MAX, x));
const budgetRule: Rule = add(
  { lookup: [Object.fromEntries(Object.entries(THREAT_BUDGETS).map(([k, b]) => [k, b.budget])), v("inputs.threat", "moderate"), 80] },
  { "*": [{ "-": [v("inputs.partySize", 4), 4] }, { lookup: [Object.fromEntries(Object.entries(THREAT_BUDGETS).map(([k, b]) => [k, b.perCharacter])), v("inputs.threat", "moderate"), 20] }] },
);

function groupSteps(k: number): PackProcedure["steps"] {
  const offset = v(`results.shape.o${k}`, 0);
  return [
    {
      id: `g${k}`,
      title: `Creature group ${k}`,
      reads: ["shape"],
      skipIf: { "!": [{ var: `results.shape.n${k}` }] },
      table: cat(id("creature.level-"), clampLevel(add(v("inputs.partyLevel", 1), offset))),
      derive: {
        n: v(`results.shape.n${k}`, 1),
        xp: { lookup: [CREATURE_XP, { "-": [v("result.level", 0), v("inputs.partyLevel", 1)] }, 0] },
      },
    },
    { id: `g${k}list`, title: `Group ${k}`, reads: [`g${k}`], skipIf: { "!": [{ var: `results.shape.n${k}` }] }, repeat: v(`results.shape.n${k}`, 1), value: v(`results.g${k}`) },
  ];
}

const groupText = (k: number): Rule =>
  ifs(v(`results.g${k}.name`, ""), cat(v(`results.g${k}.n`, 1), " × ", v(`results.g${k}.name`), " (level ", v(`results.g${k}.level`), ", ", v(`results.g${k}.xp`, 0), " XP each)", k < 3 ? ifs(v(`results.g${k + 1}.name`, ""), "; ", "") : ""), "");
const groupXp = (k: number): Rule => ({ "*": [v(`results.g${k}.n`, 0), v(`results.g${k}.xp`, 0)] });

export function procedures(): PackProcedure[] {
  return [
    {
      id: id("proc.encounter"),
      name: "Encounter builder",
      description:
        "Spends the XP budget for a threat and a party (GM Core's encounter-building numbers) on Monster Core creatures: picks a combination of creature levels that adds up to the budget, then a creature for each group. Accept to add the encounter and every creature (from its stat block). Creature levels run from −1 to 21, so at the lowest and highest party levels a shape can cost a little more or less than its budget; the encounter shows the budget and the XP actually spent.",
      cite: BUILDING_ENCOUNTERS,
      inputs: {
        type: "object",
        properties: {
          partyLevel: { type: "integer", minimum: 1, maximum: 20, default: 1, title: "Party level" },
          partySize: { type: "integer", minimum: 2, maximum: 8, default: 4, title: "Party size" },
          threat: { type: "string", enum: Object.keys(THREAT_BUDGETS), default: "moderate", title: "Threat" },
        },
      },
      steps: [
        { id: "budget", title: "XP budget", value: budgetRule },
        { id: "shape", title: "Creature levels", reads: ["budget"], table: cat(id("encounter.budget-"), v("results.budget", 80)) },
        ...groupSteps(1),
        ...groupSteps(2),
        ...groupSteps(3),
        { id: "activity", title: "Doing what", table: id("encounter.activity") },
        { id: "twist", title: "Twist", optional: true, table: id("encounter.twist") },
      ],
      produce: {
        entities: [
          {
            tempId: "encounter",
            type: ENCOUNTER,
            name: cat(v("results.g1.name"), ifs(v("results.g2.name", ""), " and company", "")),
            summary: v("results.activity.label"),
            tags: ["generated encounter"],
            fields: {
              partyLevel: v("inputs.partyLevel"),
              partySize: v("inputs.partySize"),
              threat: v("inputs.threat"),
              creatures: cat(groupText(1), groupText(2), groupText(3)),
              xpTotal: add(groupXp(1), groupXp(2), groupXp(3)),
              activity: v("results.activity.label"),
              twist: v("results.twist.label", ""),
              status: "planned",
            },
          },
          ...[1, 2, 3].map((k) => ({
            tempId: `creature${k}`,
            type: id("creature"),
            each: v(`results.g${k}list`, []),
            preset: v("item.preset"),
            name: cat(v("item.name"), " ", add(v("index"), 1)),
            links: [{ type: "appears_in", to: "encounter" }],
          })),
        ],
      },
      chains: [{ procedure: id("proc.encounter"), label: "Build another encounter", inputs: { partyLevel: v("inputs.partyLevel"), partySize: v("inputs.partySize"), threat: v("inputs.threat") } }],
    },
    {
      id: id("proc.npc"),
      name: "NPC",
      description: "A name, an ancestry, an occupation (with a Monster Core stat block to use if it comes to a fight), a quirk, a voice, what they want and what they hide.",
      original: true,
      steps: [
        { id: "first", title: "First name", table: id("npc.first-name") },
        { id: "family", title: "Family name", table: id("npc.family-name") },
        { id: "ancestry", title: "Ancestry", table: id("npc.ancestry") },
        { id: "occupation", title: "Occupation", table: id("npc.occupation") },
        { id: "quirk", title: "Quirk", table: id("npc.quirk") },
        { id: "voice", title: "Voice", table: id("npc.voice") },
        { id: "motivation", title: "Wants", table: id("npc.motivation") },
        { id: "secret", title: "Secret", table: id("npc.secret") },
      ],
      produce: {
        entities: [
          {
            tempId: "npc",
            type: NPC,
            name: cat(v("results.first.name"), " ", v("results.family.name")),
            summary: cat(v("results.ancestry.ancestry"), " ", v("results.occupation.occupation")),
            fields: {
              occupation: v("results.occupation.occupation"),
              ancestry: v("results.ancestry.ancestry"),
              quirk: v("results.quirk.text"),
              voice: v("results.voice.text"),
              motivation: v("results.motivation.text"),
              secret: v("results.secret.text"),
              statBlock: v("results.occupation.statBlock"),
              attitude: "indifferent",
            },
          },
        ],
      },
      chains: [{ procedure: id("proc.npc"), label: "Another NPC" }],
    },
    {
      id: id("proc.settlement"),
      name: "Settlement and tavern",
      description: "A settlement with a name, a size and level, a notable feature and a local trouble (as a quest rumour), its tavern and the innkeeper.",
      original: true,
      steps: [
        { id: "start", title: "Name", table: id("settlement.name-start") },
        { id: "end", title: "Name ending", table: id("settlement.name-end") },
        { id: "size", title: "Size", table: id("settlement.size") },
        { id: "feature", title: "Notable feature", table: id("settlement.feature") },
        { id: "trouble", title: "Local trouble", table: id("settlement.trouble") },
        { id: "tavernA", title: "Tavern name", table: id("tavern.name-first") },
        { id: "tavernB", title: "Tavern name", table: id("tavern.name-second") },
        { id: "special", title: "House speciality", table: id("tavern.special") },
        { id: "keeperFirst", title: "Innkeeper", table: id("npc.first-name") },
        { id: "keeperFamily", title: "Innkeeper's family", table: id("npc.family-name") },
        { id: "keeperQuirk", title: "Innkeeper's quirk", table: id("npc.quirk") },
      ],
      produce: {
        entities: [
          {
            tempId: "settlement",
            type: LOCATION,
            subtype: "settlement",
            name: cat(v("results.start.name"), v("results.end.name")),
            summary: cat("A ", v("results.size.size"), ". ", v("results.feature.text"), "."),
            fields: {
              size: v("results.size.size"),
              level: v("results.size.level"),
              population: v("results.size.population"),
              environment: "plains",
              danger: "low",
              features: [v("results.feature.text")] as unknown as Rule,
              secrets: cat("Trouble: ", v("results.trouble.text")),
            },
          },
          {
            tempId: "tavern",
            type: LOCATION,
            subtype: "building",
            name: cat("The ", v("results.tavernA.name"), " ", v("results.tavernB.name")),
            summary: v("results.special.text"),
            within: "settlement",
            fields: { description: cat("The tavern of ", v("results.start.name"), v("results.end.name"), ". Known for: ", v("results.special.text"), "."), danger: "safe" },
          },
          {
            tempId: "innkeeper",
            type: NPC,
            name: cat(v("results.keeperFirst.name"), " ", v("results.keeperFamily.name")),
            summary: "Innkeeper",
            within: "tavern",
            fields: { occupation: "Innkeeper", quirk: v("results.keeperQuirk.text"), statBlock: "Dwarf Warrior", attitude: "friendly" },
            links: [
              { type: "found_at", to: "tavern" },
              { type: "knows", to: "rumour", note: "hears every rumour at the bar" },
            ],
          },
          {
            tempId: "rumour",
            type: QUEST,
            name: v("results.trouble.text"),
            summary: "A local trouble, heard at the tavern",
            within: "settlement",
            fields: { hook: cat("In ", v("results.start.name"), v("results.end.name"), ": ", v("results.trouble.text"), "."), status: "rumour" },
          },
        ],
      },
      chains: [{ procedure: id("proc.encounter"), label: "An encounter on the road here", inputs: { partyLevel: 1 } }],
    },
  ];
}
