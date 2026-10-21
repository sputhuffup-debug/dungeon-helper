/**
 * Original GM tables and generators (written for Campaign Forge, not from the
 * SRD): random encounters that pick SRD monsters by terrain and the party's
 * level, NPCs, settlements and taverns, trinkets and weather. The terrain
 * lists below are our own judgement of where each SRD creature fits.
 */
import type { EntityPreset, PackProcedure, RollTable } from "@campaign-forge/module-sdk";
import { ENCOUNTER, id, LOCATION, MONSTER, NPC, QUEST } from "../ids.ts";
import { add, cat, ifs, v, type Rule } from "./logic.ts";

/** Generator terrains (a subset of the location environments) and the SRD creatures we place there. */
export const TERRAIN: Record<string, { name: string; monsters: string[] }> = {
  arctic: {
    name: "Arctic",
    monsters: ["wolf", "dire-wolf", "winter-wolf", "polar-bear", "mammoth", "saber-toothed-tiger", "ice-mephit", "giant-owl", "berserker", "tribal-warrior", "scout", "orc", "ogre", "troll", "werebear-hybrid", "giant-elk", "frost-giant", "remorhaz", "ice-devil", "white-dragon-wyrmling", "young-white-dragon", "adult-white-dragon", "ancient-white-dragon", "giant-goat"],
  },
  coast: {
    name: "Coast and sea",
    monsters: ["giant-crab", "merfolk", "sahuagin", "reef-shark", "harpy", "bandit", "bandit-captain", "thug", "giant-sea-horse", "giant-octopus", "swarm-of-quippers", "merrow", "sea-hag", "hunter-shark", "plesiosaurus", "killer-whale", "giant-shark", "water-elemental", "bronze-dragon-wyrmling", "young-bronze-dragon", "adult-bronze-dragon", "ancient-bronze-dragon", "storm-giant", "roc", "dragon-turtle", "kraken", "giant-eagle", "lizardfolk"],
  },
  desert: {
    name: "Desert",
    monsters: ["jackal", "giant-lizard", "camel", "giant-hyena", "vulture", "giant-vulture", "dust-mephit", "gnoll", "bandit", "bandit-captain", "tribal-warrior", "giant-scorpion", "giant-constrictor-snake", "swarm-of-insects", "mummy", "lamia", "basilisk", "medusa", "fire-elemental", "air-elemental", "salamander", "brass-dragon-wyrmling", "blue-dragon-wyrmling", "young-brass-dragon", "young-blue-dragon", "adult-brass-dragon", "adult-blue-dragon", "ancient-brass-dragon", "ancient-blue-dragon", "djinni", "efreeti", "gynosphinx", "androsphinx", "mummy-lord", "purple-worm"],
  },
  forest: {
    name: "Forest",
    monsters: ["wolf", "boar", "giant-wasp", "sprite", "goblin", "bandit", "stirge", "giant-owl", "panther", "elk", "blink-dog", "satyr", "worg", "black-bear", "hobgoblin", "gnoll", "orc", "dryad", "bugbear", "brown-bear", "dire-wolf", "giant-spider", "tiger", "scout", "bandit-captain", "ettercap", "druid", "awakened-tree", "giant-boar", "centaur", "will-o-wisp", "green-hag", "owlbear", "phase-spider", "werewolf-hybrid", "wereboar-hybrid", "green-dragon-wyrmling", "couatl", "weretiger-hybrid", "troll", "shambling-mound", "unicorn", "werebear-hybrid", "young-green-dragon", "treant", "adult-green-dragon", "ancient-green-dragon"],
  },
  grassland: {
    name: "Grassland and hills",
    monsters: ["axe-beak", "hyena", "jackal", "tribal-warrior", "bandit", "giant-wasp", "riding-horse", "elk", "orc", "gnoll", "hobgoblin", "cockatrice", "giant-hyena", "lion", "death-dog", "hippogriff", "giant-elk", "griffon", "pegasus", "berserker", "ankheg", "ogre", "rhinoceros", "copper-dragon-wyrmling", "gold-dragon-wyrmling", "veteran", "knight", "manticore", "elephant", "wereboar-hybrid", "bulette", "hill-giant", "gorgon", "triceratops", "chimera", "wyvern", "young-copper-dragon", "tyrannosaurus-rex", "young-gold-dragon", "adult-copper-dragon", "adult-gold-dragon", "ancient-copper-dragon", "ancient-gold-dragon"],
  },
  mountain: {
    name: "Mountains",
    monsters: ["kobold", "giant-goat", "eagle", "harpy", "orc", "giant-eagle", "hippogriff", "griffon", "berserker", "ogre", "gargoyle", "basilisk", "manticore", "red-dragon-wyrmling", "ettin", "air-elemental", "earth-elemental", "troll", "bulette", "chimera", "wyvern", "stone-giant", "young-red-dragon", "fire-giant", "cloud-giant", "frost-giant", "roc", "adult-red-dragon", "silver-dragon-wyrmling", "young-silver-dragon", "adult-silver-dragon", "ancient-silver-dragon", "ancient-red-dragon"],
  },
  swamp: {
    name: "Swamp",
    monsters: ["poisonous-snake", "stirge", "giant-frog", "giant-lizard", "giant-poisonous-snake", "zombie", "swarm-of-rats", "lizardfolk", "crocodile", "swarm-of-insects", "giant-toad", "ghoul", "constrictor-snake", "will-o-wisp", "ghast", "giant-constrictor-snake", "swarm-of-poisonous-snakes", "ogre-zombie", "black-dragon-wyrmling", "green-hag", "wererat-hybrid", "shambling-mound", "troll", "otyugh", "night-hag", "giant-crocodile", "young-black-dragon", "hydra", "adult-black-dragon", "ancient-black-dragon"],
  },
  underground: {
    name: "Underground",
    monsters: ["kobold", "giant-rat", "stirge", "goblin", "grimlock", "drow", "skeleton", "giant-centipede", "swarm-of-bats", "deep-gnome-svirfneblin", "darkmantle", "gray-ooze", "rust-monster", "shadow", "duergar", "ghoul", "giant-spider", "bugbear", "specter", "gelatinous-cube", "grick", "ochre-jelly", "gibbering-mouther", "mimic", "minotaur", "wight", "black-pudding", "chuul", "ghost", "otyugh", "roper", "xorn", "earth-elemental", "wraith", "vampire-spawn", "drider", "cloaker", "spirit-naga", "aboleth", "behir", "purple-worm", "lich"],
  },
  urban: {
    name: "Town and city",
    monsters: ["guard", "bandit", "cultist", "giant-rat", "mastiff", "swarm-of-rats", "thug", "acolyte", "skeleton", "zombie", "flying-sword", "swarm-of-ravens", "imp", "spy", "animated-armor", "quasit", "cult-fanatic", "priest", "wererat-hybrid", "rug-of-smothering", "doppelganger", "veteran", "knight", "ghost", "succubus-incubus", "gladiator", "flesh-golem", "vampire-spawn", "mage", "invisible-stalker", "shield-guardian", "oni", "assassin", "clay-golem", "stone-golem", "archmage", "rakshasa", "vampire-vampire"],
  },
};

/** Party level bands and the challenge ratings each one meets. */
export const TIERS = [
  { tier: 1, levels: "1–4", minCr: 0.125, maxCr: 3, target: 1 },
  { tier: 2, levels: "5–10", minCr: 1, maxCr: 8, target: 4 },
  { tier: 3, levels: "11–16", minCr: 4, maxCr: 15, target: 9 },
  { tier: 4, levels: "17–20", minCr: 9, maxCr: 30, target: 16 },
];

/** How many appear: more of the weaker creatures in a band (a rough guide, not an encounter-balance formula). */
function countFor(cr: number, target: number): string | undefined {
  const r = target / Math.max(cr, 0.125);
  if (r >= 8) return "2d4";
  if (r >= 4) return "1d4+1";
  if (r >= 2) return "1d3";
  if (r >= 1.25) return "1d2";
  return undefined;
}

const COUNT_TABLES: Record<string, { id: string; min: number; max: number }> = {
  "1d2": { id: id("count.d2"), min: 1, max: 2 },
  "1d3": { id: id("count.d3"), min: 1, max: 3 },
  "1d4+1": { id: id("count.d4-plus-1"), min: 2, max: 5 },
  "2d4": { id: id("count.two-d4"), min: 2, max: 8 },
};

const crText = (cr: number) => (cr === 0.125 ? "1/8" : cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : String(cr));

/** Pick up to `n` items spread evenly over a sorted list. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!);
}

function encounterTables(monsters: EntityPreset[]): RollTable[] {
  const byIndex = new Map(monsters.map((m) => [m.id.slice(id("preset.").length), m]));
  const tables: RollTable[] = [];
  for (const [terrain, def] of Object.entries(TERRAIN)) {
    const all = def.monsters.map((idx) => {
      const m = byIndex.get(idx);
      if (!m) throw new Error(`terrain ${terrain}: unknown SRD monster "${idx}"`);
      return { idx, m, cr: Number(m.fields.cr ?? 0), xp: Number(m.fields.xp ?? 0) };
    });
    for (const t of TIERS) {
      let pool = all.filter((x) => x.cr >= t.minCr && x.cr <= t.maxCr).sort((a, b) => a.cr - b.cr || a.m.name.localeCompare(b.m.name));
      // Thin bands borrow the nearest creatures outside them so every table has at least four rows.
      if (pool.length < 4) {
        const near = all
          .filter((x) => !pool.includes(x))
          .sort((a, b) => Math.abs(Math.log2(Math.max(a.cr, 0.125) / t.target)) - Math.abs(Math.log2(Math.max(b.cr, 0.125) / t.target)));
        pool = [...pool, ...near.slice(0, 4 - pool.length)].sort((a, b) => a.cr - b.cr);
      }
      const picks = spread(pool, 12);
      tables.push({
        id: id(`encounter.${terrain}-${t.tier}`),
        name: `${def.name} encounters (levels ${t.levels})`,
        family: "encounter",
        original: true,
        dice: `1d${picks.length}`,
        notes: "Who the party meets. Creatures and numbers are suggestions for the level band; adjust to the party's size and how rested they are.",
        rows: picks.map((p, i) => {
          const count = countFor(p.cr, t.target);
          const counted = count ? COUNT_TABLES[count]! : undefined;
          return {
            range: [i + 1, i + 1] as [number, number],
            label: `${p.m.name}${count ? ` (${count})` : ""}, CR ${crText(p.cr)}`,
            result: { preset: p.m.id, name: p.m.name, cr: crText(p.cr), xp: p.xp, ...(counted ? {} : { count: { n: 1 } }) },
            ...(counted ? { roll: [{ table: counted.id, as: "count" }] } : {}),
          };
        }),
      });
    }
  }
  for (const [dice, c] of Object.entries(COUNT_TABLES)) {
    tables.push({
      id: c.id,
      name: `Number appearing (${dice})`,
      family: "count",
      original: true,
      dice,
      rows: Array.from({ length: c.max - c.min + 1 }, (_, i) => ({ range: [c.min + i, c.min + i] as [number, number], label: String(c.min + i), result: { n: c.min + i } })),
    });
  }
  return tables;
}

/** A table from a list of results, one die face (or band) each. */
function simple(tableId: string, name: string, dice: string, labels: string[], key = "text"): RollTable {
  const faces = Number(/^1d(\d+)$/.exec(dice)?.[1]);
  if (faces !== labels.length) throw new Error(`${tableId}: ${labels.length} rows for ${dice}`);
  return {
    id: id(tableId),
    name,
    family: tableId.split(".")[0]!,
    original: true,
    dice,
    rows: labels.map((label, i) => ({ range: [i + 1, i + 1] as [number, number], label, result: { [key]: label } })),
  };
}

const OCCUPATIONS: Array<[string, string]> = [
  ["Innkeeper", "Commoner"],
  ["Town guard", "Guard"],
  ["Temple acolyte", "Acolyte"],
  ["Village priest", "Priest"],
  ["Minor noble", "Noble"],
  ["Smuggler", "Bandit"],
  ["Debt collector", "Thug"],
  ["Informant", "Spy"],
  ["Retired mercenary", "Veteran"],
  ["Knight errant", "Knight"],
  ["Hedge druid", "Druid"],
  ["Cult recruiter", "Cult Fanatic"],
  ["Pit fighter", "Gladiator"],
  ["Hunter", "Tribal Warrior"],
  ["Forest guide", "Scout"],
  ["Blacksmith", "Commoner"],
  ["Travelling merchant", "Commoner"],
  ["Street urchin", "Commoner"],
  ["Ship's mate", "Bandit"],
  ["Court wizard", "Mage"],
];

const tablesList = (monsters: EntityPreset[]): RollTable[] => {
  const statBlock = new Map(monsters.map((m) => [m.name, m.id]));
  for (const [, s] of OCCUPATIONS) if (!statBlock.has(s)) throw new Error(`occupation stat block ${s} is not an SRD monster`);
  return [
    ...encounterTables(monsters),
    simple("encounter.activity", "What they are doing", "1d10", [
      "Hunting for food, and the party smells like dinner",
      "Resting or asleep, with one sentry dozing",
      "Fighting among themselves over a prize",
      "Guarding something they were told to guard",
      "Fleeing from something worse",
      "Arguing about which way to go",
      "Setting an ambush on the road ahead",
      "Wounded, and more dangerous for it",
      "Escorting a prisoner",
      "Searching the ground for something they lost",
    ], "label"),
    simple("encounter.twist", "Encounter twist", "1d12", [
      "The weather turns: fog, rain or a sudden gale",
      "A third party arrives halfway through",
      "One of them wants to defect and will bargain",
      "The ground is unstable, burning or flooding",
      "They carry a clue to the current quest",
      "Their leader is not what it seems",
      "They are under a curse or compulsion",
      "A captive among them begs for rescue",
      "They mistake the party for someone else",
      "Reinforcements are a few rounds away",
      "They have already been weakened by another fight",
      "Something valuable will be lost if the fight drags on",
    ], "label"),
    {
      id: id("npc.occupation"),
      name: "NPC occupation",
      family: "npc",
      original: true,
      dice: "1d20",
      notes: "Each occupation suggests an SRD stat block in case it comes to a fight.",
      rows: OCCUPATIONS.map(([job, block], i) => ({ range: [i + 1, i + 1] as [number, number], label: job, result: { occupation: job, statBlock: block, preset: statBlock.get(block)! } })),
    },
    {
      id: id("npc.race"),
      name: "NPC race",
      family: "npc",
      original: true,
      dice: "1d12",
      rows: [
        { range: [1, 4], label: "Human", result: { race: "Human" } },
        { range: [5, 5], label: "Dwarf", result: { race: "Dwarf" } },
        { range: [6, 6], label: "Elf", result: { race: "Elf" } },
        { range: [7, 7], label: "Halfling", result: { race: "Halfling" } },
        { range: [8, 8], label: "Gnome", result: { race: "Gnome" } },
        { range: [9, 9], label: "Half-Elf", result: { race: "Half-Elf" } },
        { range: [10, 10], label: "Half-Orc", result: { race: "Half-Orc" } },
        { range: [11, 11], label: "Dragonborn", result: { race: "Dragonborn" } },
        { range: [12, 12], label: "Tiefling", result: { race: "Tiefling" } },
      ],
    },
    simple("npc.first-name", "First name", "1d20", ["Abel", "Brannoc", "Corra", "Dagny", "Edric", "Fenna", "Gorrim", "Hesta", "Ilvar", "Jorun", "Kessa", "Lorcan", "Maelis", "Nedda", "Orrin", "Pell", "Quilla", "Roswin", "Sabeth", "Tamsin"], "name"),
    simple("npc.family-name", "Family name", "1d20", ["Ashby", "Brightwater", "Coldhollow", "Dunmore", "Emberlake", "Fallow", "Greyhame", "Hollins", "Ironside", "Juniper", "Kettle", "Longbarrow", "Marsh", "Nettlefield", "Oakes", "Pike", "Quarry", "Rook", "Stillwell", "Thorne"], "name"),
    simple("npc.quirk", "NPC quirk", "1d20", [
      "Hums while thinking, always the same tune",
      "Collects buttons and asks for yours",
      "Never sits with their back to a door",
      "Speaks of themselves in the third person",
      "Laughs at the wrong moments",
      "Counts coins twice, then once more",
      "Smells strongly of a herb nobody can name",
      "Answers questions with questions",
      "Has a pet that goes everywhere with them",
      "Constantly sketches the people they meet",
      "Mispronounces one common word, proudly",
      "Keeps a list of everyone who has wronged them",
      "Superstitious about the number seven",
      "Overly formal, even with friends",
      "Eats while talking, every time",
      "Quotes a grandparent's sayings",
      "Wears far too much jewellery",
      "Whispers when saying anything important",
      "Cannot resist a wager",
      "Polishes a battered old ring when nervous",
    ]),
    simple("npc.motivation", "What they want", "1d12", [
      "Money to pay off a dangerous debt",
      "Revenge on someone the party may know",
      "To protect a younger sibling",
      "Respect from people who laughed at them",
      "To leave town and never come back",
      "A cure for a sick friend",
      "To prove a rumour true",
      "The deed to a piece of land",
      "Forgiveness for an old mistake",
      "To be left alone",
      "Power over a rival",
      "To find someone who went missing",
    ]),
    simple("npc.secret", "Their secret", "1d12", [
      "Works for the people the party is hunting",
      "Is not who they claim to be",
      "Saw the crime and said nothing",
      "Owes money to a dangerous faction",
      "Has a magic item they cannot control",
      "Is in love with someone forbidden to them",
      "Buried something valuable nearby",
      "Is being blackmailed",
      "Once served the villain",
      "Knows a hidden way in",
      "Has a price on their head elsewhere",
      "Has no secret, and is suspected anyway",
    ]),
    simple("npc.voice", "Voice and manner", "1d10", [
      "Slow and careful, every word weighed",
      "Loud, cheerful, too close",
      "Clipped and impatient",
      "Soft-spoken; you lean in to hear",
      "Theatrical, with big gestures",
      "Nervous, trails off mid-sentence",
      "Deadpan; impossible to tell if joking",
      "Sing-song, with a strong regional accent",
      "Gravelly, punctuated by coughs",
      "Warm and motherly, calls everyone 'dear'",
    ]),
    simple("settlement.name-start", "Settlement name (start)", "1d20", ["Ash", "Bram", "Cold", "Dun", "Elder", "Fair", "Glen", "Hollow", "Iron", "Kings", "Long", "Mill", "North", "Oak", "Raven", "Salt", "Stone", "Thorn", "West", "Wil"], "name"),
    simple("settlement.name-end", "Settlement name (end)", "1d20", ["bridge", "brook", "bury", "by", "cross", "dale", "field", "ford", "gate", "haven", "holm", "hurst", "mere", "moor", "stead", "thorpe", "ton", "wick", "wood", "worth"], "name"),
    {
      id: id("settlement.size"),
      name: "Settlement size",
      family: "settlement",
      original: true,
      dice: "1d6",
      rows: [
        { range: [1, 2], label: "Hamlet", result: { size: "hamlet", population: "a few dozen" } },
        { range: [3, 4], label: "Village", result: { size: "village", population: "a few hundred" } },
        { range: [5, 5], label: "Town", result: { size: "town", population: "a few thousand" } },
        { range: [6, 6], label: "City", result: { size: "city", population: "tens of thousands" } },
      ],
    },
    simple("settlement.feature", "Notable feature", "1d12", [
      "A bridge older than anyone remembers",
      "A market that never closes",
      "A temple with a cracked bell",
      "Walls half-built and abandoned",
      "A tower nobody enters",
      "A famous brewery",
      "Hot springs",
      "A great tree at the centre of the square",
      "An overgrown battlefield nearby",
      "A ferry run by one stubborn family",
      "Statues of a forgotten hero",
      "A mine that just reopened",
    ]),
    simple("settlement.trouble", "Local trouble", "1d12", [
      "Livestock vanish at night",
      "The well has gone bad",
      "Two families are close to open feud",
      "A tax collector demands double",
      "Strangers have taken over the old mill",
      "Children report a voice in the woods",
      "A sickness spreads from the docks",
      "The lord's heir is missing",
      "A bandit gang demands tribute",
      "Graves are found opened",
      "The harvest is failing for no clear reason",
      "A wizard's experiment has escaped",
    ]),
    simple("tavern.name-first", "Tavern name (first word)", "1d20", ["Silver", "Rusty", "Prancing", "Sleeping", "Golden", "Drunken", "Laughing", "Crooked", "Wandering", "Bold", "Black", "Lucky", "Weary", "Merry", "Jolly", "Gilded", "Copper", "Hungry", "Red", "Singing"], "name"),
    simple("tavern.name-second", "Tavern name (second word)", "1d20", ["Stag", "Kettle", "Badger", "Anchor", "Goose", "Lantern", "Barrel", "Dragon", "Fiddler", "Mule", "Crown", "Boar", "Harp", "Wheel", "Owl", "Tankard", "Fox", "Shield", "Pony", "Hound"], "name"),
    simple("tavern.special", "House speciality", "1d10", [
      "Peppered mutton stew, ruinously spicy",
      "Dark ale brewed with honey",
      "Fish pies, fresh every morning",
      "A cider that is mostly rumour",
      "Roast fowl with burnt-sugar glaze",
      "Hard cheese from the owner's own goats",
      "Mulled wine and card games",
      "Bard nights: anyone may sing, everyone must listen",
      "A secret back room for private talk",
      "The cheapest beds in the region, with good reason",
    ]),
    simple("treasure.trinket", "Trinket", "1d20", [
      "A brass key with no teeth",
      "A tin soldier painted in unfamiliar colours",
      "A pressed flower inside a folded letter",
      "A wooden whistle that makes no sound",
      "A glass marble with a tiny bubble trapped inside",
      "A child's drawing of a dragon",
      "A ring of braided horsehair",
      "A die with two sixes and no one",
      "A thimble engraved with initials",
      "A shard of a mirror that fogs when you breathe near it",
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
    simple("travel.weather", "Weather on the road", "1d12", [
      "Clear and bright",
      "Clear and bitterly cold",
      "Overcast and still",
      "Light rain all day",
      "Heavy rain; roads turn to mud",
      "Thick fog until midday",
      "Strong wind from the hills",
      "Thunderstorm in the afternoon",
      "Hot and humid",
      "Sleet or snow, depending on the season",
      "A sudden hailstorm",
      "Perfect travelling weather; something feels wrong",
    ]),
  ];
};

/** A table result's `text`, as the line the GM sees for the step. */
const TEXT: Rule = v("result.text", "");
/** A repeated step's line: "4 × Goblin". */
const countOf = (name: Rule): Rule => cat({ len: [v("result", [])] }, " × ", name);

const tierOf = (level: Rule): Rule => ifs({ "<=": [level, 4] }, 1, { "<=": [level, 10] }, 2, { "<=": [level, 16] }, 3, 4);

const procedures = (): PackProcedure[] => [
  {
    id: id("proc.encounter"),
    name: "Random encounter",
    description: "Picks SRD monsters for the terrain and the party's level band, what they are doing and an optional twist. Accept to add the encounter and every creature (from its SRD stat block) to the campaign.",
    original: true,
    inputs: {
      type: "object",
      properties: {
        partyLevel: { type: "integer", minimum: 1, maximum: 20, default: 3, title: "Party level" },
        terrain: { type: "string", enum: Object.keys(TERRAIN), default: "forest", title: "Terrain" },
      },
    },
    steps: [
      {
        id: "foe",
        title: "Who",
        table: cat(id("encounter."), v("inputs.terrain", "forest"), "-", tierOf(v("inputs.partyLevel", 3))),
        display: cat(v("result.name"), " (CR ", v("result.cr"), ", ", v("result.xp", 0), " XP each)"),
      },
      { id: "group", title: "How many", reads: ["foe"], repeat: { var: ["results.foe.count.n", 1] }, value: { var: "results.foe" }, display: countOf(v("result.0.name")) },
      { id: "activity", title: "Doing what", table: id("encounter.activity") },
      { id: "twist", title: "Twist", optional: true, table: id("encounter.twist") },
    ],
    produce: {
      entities: [
        {
          tempId: "encounter",
          type: ENCOUNTER,
          name: cat({ var: ["results.foe.count.n", 1] }, " × ", v("results.foe.name")),
          summary: v("results.activity.label"),
          tags: ["random encounter"],
          fields: {
            environment: v("inputs.terrain"),
            partyLevel: v("inputs.partyLevel"),
            creatures: cat({ var: ["results.foe.count.n", 1] }, " × ", v("results.foe.name"), " (CR ", v("results.foe.cr"), ", ", v("results.foe.xp"), " XP each)"),
            activity: v("results.activity.label"),
            twist: v("results.twist.label", ""),
            xpTotal: { "*": [{ var: ["results.foe.count.n", 1] }, v("results.foe.xp", 0)] },
            status: "planned",
          },
        },
        {
          tempId: "creature",
          type: MONSTER,
          each: v("results.group"),
          preset: v("item.preset"),
          name: cat(v("item.name"), " ", add(v("index"), 1)),
          links: [{ type: "appears_in", to: "encounter" }],
        },
      ],
    },
    chains: [{ procedure: id("proc.encounter"), label: "Roll another encounter here", inputs: { partyLevel: v("inputs.partyLevel"), terrain: v("inputs.terrain") } }],
  },
  {
    id: id("proc.npc"),
    name: "NPC",
    description: "A name, an occupation (with an SRD stat block to use if it comes to a fight), a quirk, a voice, what they want and what they hide.",
    original: true,
    steps: [
      { id: "first", title: "First name", table: id("npc.first-name") },
      { id: "family", title: "Family name", table: id("npc.family-name") },
      { id: "race", title: "Race", table: id("npc.race"), display: v("result.race", "") },
      { id: "occupation", title: "Occupation", table: id("npc.occupation"), display: cat(v("result.occupation"), " (stat block: ", v("result.statBlock"), ")") },
      { id: "quirk", title: "Quirk", table: id("npc.quirk"), display: TEXT },
      { id: "voice", title: "Voice", table: id("npc.voice"), display: TEXT },
      { id: "motivation", title: "Wants", table: id("npc.motivation"), display: TEXT },
      { id: "secret", title: "Secret", table: id("npc.secret"), display: TEXT },
    ],
    produce: {
      entities: [
        {
          tempId: "npc",
          type: NPC,
          name: cat(v("results.first.name"), " ", v("results.family.name")),
          summary: cat(v("results.race.race"), " ", v("results.occupation.occupation")),
          fields: {
            occupation: v("results.occupation.occupation"),
            race: v("results.race.race"),
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
    description: "A settlement with a name, a notable feature and a local trouble (as a quest rumour), its tavern and the innkeeper.",
    original: true,
    steps: [
      { id: "start", title: "Name", table: id("settlement.name-start") },
      { id: "end", title: "Name ending", table: id("settlement.name-end") },
      { id: "size", title: "Size", table: id("settlement.size"), display: cat(v("label", v("result.size")), " (", v("result.population"), ")") },
      { id: "feature", title: "Notable feature", table: id("settlement.feature"), display: TEXT },
      { id: "trouble", title: "Local trouble", table: id("settlement.trouble"), display: TEXT },
      { id: "tavernA", title: "Tavern name", table: id("tavern.name-first") },
      { id: "tavernB", title: "Tavern name", table: id("tavern.name-second") },
      { id: "special", title: "House speciality", table: id("tavern.special"), display: TEXT },
      { id: "keeperFirst", title: "Innkeeper", table: id("npc.first-name") },
      { id: "keeperFamily", title: "Innkeeper's family", table: id("npc.family-name") },
      { id: "keeperQuirk", title: "Innkeeper's quirk", table: id("npc.quirk"), display: TEXT },
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
            population: v("results.size.population"),
            environment: "grassland",
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
          fields: { occupation: "Innkeeper", quirk: v("results.keeperQuirk.text"), statBlock: "Commoner", attitude: "friendly" },
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
    chains: [{ procedure: id("proc.encounter"), label: "An encounter on the road here", inputs: { terrain: "grassland" } }],
  },
];

export function originalTables(monsters: EntityPreset[]): { tables: RollTable[]; procedures: PackProcedure[] } {
  return { tables: tablesList(monsters), procedures: procedures() };
}

export const ENCOUNTER_TERRAINS = Object.keys(TERRAIN);
