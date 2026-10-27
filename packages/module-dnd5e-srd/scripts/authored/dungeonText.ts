/**
 * Original dungeon dressing (written for Campaign Forge, in our own words):
 * room purposes with a line to read aloud for each site type, the lair and
 * the way in, and room, sense and passage dressing. No game rules: both the
 * fifth edition and the ORC pack build their dungeon tables from this file.
 */

export interface RoomText {
  name: string;
  readAloud: string;
  /** A GM line: what the room is for, what hides in it. */
  gm?: string;
  tags?: string[];
  flags?: Record<string, boolean>;
}

export type SiteId = "crypt" | "cave" | "keep" | "sewer" | "temple" | "mine";

export interface SiteText {
  label: string;
  archetype: "halls" | "caverns" | "keep" | "channels" | "nave" | "tunnels";
  description: string;
  keywords: string[];
  passageName: string;
  outsideName: string;
  levelName: string;
  rooms: RoomText[];
  lairs: RoomText[];
  entrances: RoomText[];
  /** The archetype's great hall (a temple's nave). */
  halls?: RoomText[];
  /** Chance each room is dark, rough or wet. */
  flags: Record<string, number>;
  passageFlags?: Record<string, number>;
}

const W = { water: true };
const D = { difficult: true };
const WD = { water: true, difficult: true };

export const SITES: Record<SiteId, SiteText> = {
  crypt: {
    label: "Crypt or tomb",
    archetype: "halls",
    description: "A processional passage with tombs in mirrored pairs, an antechamber at its foot and the burial chamber at its head.",
    keywords: ["crypt", "tomb", "barrow", "catacomb", "mausoleum", "sepulchre", "ossuary", "grave"],
    passageName: "Passage",
    outsideName: "Graveyard",
    levelName: "Level",
    flags: { dark: 0.7 },
    rooms: [
      { name: "Ossuary", readAloud: "Skulls and long bones are stacked to the ceiling in neat, patient rows.", tags: ["dead"] },
      { name: "Embalming room", readAloud: "A stone slab with blood gutters, and shelves of jars whose wax seals are broken." },
      { name: "Mourners' chapel", readAloud: "Benches face a cracked altar. Someone left fresh candles here, not long ago." },
      { name: "Burial niches", readAloud: "The walls are honeycombed with niches, each holding a shrouded shape.", tags: ["dead"] },
      { name: "Knight's tomb", readAloud: "A stone knight lies on the lid of a sarcophagus, sword clasped to its chest." },
      { name: "Grave-goods store", readAloud: "Chests and urns are heaped against the walls, most of them already pried open." },
      { name: "Collapsed vault", readAloud: "Half the ceiling has come down; roots hang through the gap like reaching hands.", flags: D },
      { name: "Priest's cell", readAloud: "A narrow cot, a prayer rope, and a ledger of names written in a careful hand." },
      { name: "Hall of statues", readAloud: "Robed statues line both walls, faces worn smooth, every one turned toward the door." },
      { name: "Charnel pit", readAloud: "A railing guards a pit whose bottom you cannot see. The air rising from it is cold." },
      { name: "Family vault", readAloud: "Name plaques line the walls: three generations of one family, the last plaque left blank." },
      { name: "Flooded crypt", readAloud: "Black water stands knee-deep, and coffin lids float in it like rafts.", flags: WD },
    ],
    lairs: [
      { name: "Founder's burial chamber", readAloud: "A great sarcophagus stands on a dais, its lid carved with a face that is almost smiling." },
      { name: "Necromancer's sanctum", readAloud: "Candles burn in a ring of chalk symbols around a table fitted with leather straps." },
      { name: "The sealed tomb", readAloud: "Iron bands and wax seals cover this side of the door. Whoever sealed it meant to keep something in." },
      { name: "Reliquary", readAloud: "Gold glints in an alcove behind a screen of bones wired together into a lattice." },
    ],
    entrances: [
      { name: "Gate of the dead", readAloud: "Two stone guardians flank a stair leading down; the iron gate between them hangs open." },
      { name: "Mortuary chapel", readAloud: "A small chapel with its altar pushed aside, uncovering steps down into the dark." },
      { name: "Barrow mouth", readAloud: "A low stone doorway, its lintel carved with weathered warnings." },
    ],
  },
  cave: {
    label: "Cave or cavern",
    archetype: "caverns",
    description: "Irregular chambers joined by winding open tunnels.",
    keywords: ["cave", "cavern", "grotto", "warren", "den", "burrow", "hollow"],
    passageName: "Tunnel",
    outsideName: "Hillside",
    levelName: "Depth",
    flags: { dark: 0.6, difficult: 0.25, water: 0.1 },
    passageFlags: { difficult: 0.2 },
    rooms: [
      { name: "Dripping grotto", readAloud: "Water drips from a forest of stalactites into shallow pools.", flags: W },
      { name: "Bat roost", readAloud: "The ceiling rustles. Droppings crust the floor ankle-deep." },
      { name: "Fungus garden", readAloud: "Pale mushrooms as tall as a child glow a faint blue." },
      { name: "Bone midden", readAloud: "Gnawed bones, broken weapons and torn packs: something eats here." },
      { name: "Underground stream", readAloud: "A fast black stream cuts across the cave; the far bank is a long step away.", flags: WD },
      { name: "Crystal hollow", readAloud: "Quartz glitters in every wall, throwing your light back at you a hundred times." },
      { name: "Rockfall", readAloud: "A slope of fallen boulders. Crossing it means picking a careful way.", flags: D },
      { name: "Sleeping chamber", readAloud: "Nests of moss and hide line the walls. They are still warm." },
      { name: "Echoing cavern", readAloud: "Every footstep comes back three times. The roof is lost in the dark." },
      { name: "Narrow squeeze", readAloud: "The walls close in until you must turn sideways to pass.", flags: D },
      { name: "Old campsite", readAloud: "A ring of stones, cold ashes and a name carved in the rock: someone sheltered here long ago." },
      { name: "Chasm edge", readAloud: "The floor ends at a crack too deep to see the bottom of. A draught moans out of it." },
    ],
    lairs: [
      { name: "Beast's den", readAloud: "The stench hits first. Bones crunch underfoot, and two eyes catch your light." },
      { name: "Hoard cave", readAloud: "Coins and plunder are heaped in a natural basin, polished smooth by something that sleeps on them." },
      { name: "Shrine of the deep", readAloud: "A crude idol of piled stones stands over a still pool, hung with offerings." },
      { name: "Chief's hall", readAloud: "A wide cavern with a throne of lashed timber and furs at its far end." },
    ],
    entrances: [
      { name: "Cave mouth", readAloud: "A wide cave mouth half hidden by hanging roots; the ground slopes down into darkness." },
      { name: "Sinkhole", readAloud: "A collapsed sinkhole with a rope tied to a stake, leading down." },
      { name: "Waterfall cave", readAloud: "Behind a curtain of falling water, a wet ledge leads into the hill.", flags: W },
    ],
  },
  keep: {
    label: "Keep, castle or tower",
    archetype: "keep",
    description: "A rectangular block cut into rooms either side of a central hall, with a tower at each corner and the gatehouse on the front.",
    keywords: ["keep", "castle", "tower", "fort", "fortress", "stronghold", "manor", "watchtower", "citadel"],
    passageName: "Hall",
    outsideName: "Bailey",
    levelName: "Floor",
    flags: { dark: 0.4 },
    rooms: [
      { name: "Great hall", readAloud: "Long tables, a cold hearth wide enough to stand in, and banners rotted to rags." },
      { name: "Kitchen", readAloud: "Copper pots on hooks, a bread oven, and a chopping block scored with a thousand cuts." },
      { name: "Barracks", readAloud: "Rows of bunks and a weapon rack, mostly empty." },
      { name: "Armoury", readAloud: "Racks of spears and a grindstone. The good blades are gone." },
      { name: "Chapel", readAloud: "A plain altar under a narrow window of coloured glass." },
      { name: "Solar", readAloud: "A private room: a rug, a writing desk, and a view over the walls." },
      { name: "Storeroom", readAloud: "Barrels, sacks of grain gone to dust, and a ladder to a loft." },
      { name: "Guardroom", readAloud: "A table with a dice cup and a half-finished game, abandoned in a hurry." },
      { name: "Stables", readAloud: "Stalls of mouldy straw; the tack still hangs on its pegs." },
      { name: "Well room", readAloud: "A stone well-head in the middle of the floor. The rope is new." },
      { name: "Library", readAloud: "Shelves of ledgers and a few books, swollen with damp." },
      { name: "Gaol", readAloud: "Cells with iron doors, one of them locked, and a key ring hanging just out of reach." },
    ],
    lairs: [
      { name: "Lord's chamber", readAloud: "A canopied bed, a strongbox at its foot, and a chair placed to face the door." },
      { name: "Throne room", readAloud: "A raised seat under a faded coat of arms. Someone has been sitting in it." },
      { name: "Treasury", readAloud: "An iron-bound room with a single door and chests along every wall." },
      { name: "War room", readAloud: "A table covered in maps weighted with daggers. The plans are recent." },
    ],
    entrances: [
      { name: "Gatehouse", readAloud: "A vaulted passage through the wall, with murder holes in the ceiling." },
      { name: "Postern", readAloud: "A small side door in the wall, its bar lifted from the inside." },
      { name: "Entrance hall", readAloud: "A heavy door at the top of a short stair, scarred by axes." },
    ],
  },
  sewer: {
    label: "Sewer or aqueduct",
    archetype: "channels",
    description: "A long water channel in sections, with chambers and side tunnels off it and an outfall at one end.",
    keywords: ["sewer", "sewers", "aqueduct", "cistern", "drain", "culvert", "undercity"],
    passageName: "Tunnel",
    outsideName: "Outfall",
    levelName: "Level",
    flags: { dark: 0.6, water: 0.25 },
    passageFlags: { water: 1, difficult: 0.3 },
    rooms: [
      { name: "Junction chamber", readAloud: "Three tunnels meet in a round chamber; the water swirls before choosing a way.", flags: W },
      { name: "Cistern", readAloud: "A vast tank of still water with a narrow walkway around its edge.", flags: W },
      { name: "Maintenance room", readAloud: "Rusted tools, a broken lantern and a map scratched into the wall." },
      { name: "Overflow basin", readAloud: "A sunken basin where debris collects: crates, bones and a drowned cart.", flags: WD },
      { name: "Smugglers' cache", readAloud: "Oilcloth bundles stacked on a dry ledge, well out of the water's reach." },
      { name: "Old shrine", readAloud: "A niche to a forgotten river spirit, with fresh coins in its bowl." },
      { name: "Pump room", readAloud: "A great wooden wheel and pistons, long seized. Water hisses through the cracks." },
      { name: "Collapsed section", readAloud: "Fallen masonry chokes half the chamber; the rest is a scramble.", flags: D },
      { name: "Rat nest", readAloud: "Shredded cloth and hair line a hollow in the wall. It squeaks." },
      { name: "Grated outflow", readAloud: "Light falls through a grating far above; you hear carts and voices." },
      { name: "Beggars' camp", readAloud: "Bedrolls and a cookfire on a ledge, hastily abandoned." },
      { name: "Fungus tunnel", readAloud: "Slime and pale fungus coat the walls. The air is thick and sweet." },
    ],
    lairs: [
      { name: "Thieves' hideout", readAloud: "A dry vault with hammocks, a strongbox and a table of plans." },
      { name: "The drowned hall", readAloud: "An old cellar of the city above, half flooded, with a throne on its dry end.", flags: W },
      { name: "The deep pool", readAloud: "A deep, still pool. Bubbles rise from it, slowly.", flags: W },
      { name: "Cult meeting place", readAloud: "A circle of candles on a raised floor, and a symbol painted in something dark." },
    ],
    entrances: [
      { name: "Outfall tunnel", readAloud: "The tunnel mouth opens over the river behind a rusted grate." },
      { name: "Manhole shaft", readAloud: "Iron rungs lead down from a street grating into the dark." },
      { name: "Cellar breach", readAloud: "A hole knocked through a cellar wall into the old sewer." },
    ],
  },
  temple: {
    label: "Ruined temple",
    archetype: "nave",
    description: "A long nave with the sanctum at its head, the narthex at its foot and chapels down both sides; parts have fallen in.",
    keywords: ["temple", "church", "chapel", "cathedral", "abbey", "monastery", "shrine", "sanctuary"],
    passageName: "Passage",
    outsideName: "Forecourt",
    levelName: "Level",
    flags: { dark: 0.5, difficult: 0.2 },
    rooms: [
      { name: "Side chapel", readAloud: "A small altar to a lesser saint, its candles long burnt down." },
      { name: "Vestry", readAloud: "Robes on pegs, a chest of censers, and a cracked mirror." },
      { name: "Cloister", readAloud: "Pillars around a square of sky; weeds push up between the flagstones." },
      { name: "Scriptorium", readAloud: "Writing desks with dry inkwells; a half-copied text lies open." },
      { name: "Bell room", readAloud: "A bell rope hangs from a hole in the ceiling. The bell is gone." },
      { name: "Reliquary chapel", readAloud: "Glass cases, all smashed, and one small box no one noticed." },
      { name: "Pilgrims' dormitory", readAloud: "Straw pallets in rows, and prayers scratched into the wall." },
      { name: "Collapsed aisle", readAloud: "The roof has fallen in. Sunlight and rain come through the hole.", flags: D },
      { name: "Chapter house", readAloud: "A ring of stone seats facing a lectern carved like an eagle." },
      { name: "Ossuary chapel", readAloud: "Bones arranged into patterns on every wall and across the ceiling." },
      { name: "Treasury of offerings", readAloud: "Alms boxes broken open; a few coins still lie in the corners." },
      { name: "Crypt stair", readAloud: "A stair spirals down beneath a slab that has been moved aside." },
    ],
    halls: [
      { name: "Nave", readAloud: "Rows of broken pews march toward the far end, where the light falls." },
      { name: "Great nave", readAloud: "Pillars like a stone forest hold up a roof of painted stars, flaking away." },
      { name: "Burnt nave", readAloud: "Half the pews are ash. Birds nest in the blackened rafters.", flags: D },
    ],
    lairs: [
      { name: "Sanctum", readAloud: "The high altar stands under a broken dome. Something waits beside it." },
      { name: "Desecrated altar", readAloud: "The altar has been overturned and a new idol raised in its place." },
      { name: "Oracle's hall", readAloud: "A cracked tripod over a fissure that breathes warm, sweet air." },
      { name: "Saint's tomb", readAloud: "A golden casket on a plinth, guarded by statues holding real swords." },
    ],
    entrances: [
      { name: "Narthex", readAloud: "A porch of fallen columns, and great doors standing half open." },
      { name: "Pilgrims' porch", readAloud: "A wide porch worn smooth by a thousand knees." },
      { name: "West front", readAloud: "A ruined façade of saints with their faces knocked off, over a gaping doorway." },
    ],
  },
  mine: {
    label: "Mine",
    archetype: "tunnels",
    description: "Small workings strung along long, winding drifts.",
    keywords: ["mine", "mines", "quarry", "dig", "shaft", "delve", "lode"],
    passageName: "Drift",
    outsideName: "Pithead",
    levelName: "Level",
    flags: { dark: 0.6, difficult: 0.2 },
    passageFlags: { difficult: 0.15 },
    rooms: [
      { name: "Ore face", readAloud: "Pick marks score the rock, and a vein of ore glints in your light." },
      { name: "Cart depot", readAloud: "Ore carts on rusted rails, one of them tipped on its side." },
      { name: "Timbered gallery", readAloud: "Old props hold up the roof, some of them cracked and bowing." },
      { name: "Miners' shrine", readAloud: "A little shrine to the earth, with candle stubs and a lucky pick." },
      { name: "Flooded working", readAloud: "The lower end of this cut is under cold, still water.", flags: WD },
      { name: "Collapsed stope", readAloud: "A cave-in has left a heap of rubble and a dark gap above it.", flags: D },
      { name: "Bunk room", readAloud: "Wooden bunks and a stove; someone's boots still stand by the door." },
      { name: "Powder store", readAloud: "Kegs marked with warning signs, stacked well away from the lamps." },
      { name: "Winch room", readAloud: "A great winch over a shaft that drops away into darkness." },
      { name: "Smelting hall", readAloud: "A cold furnace, slag heaps, and moulds for ingots." },
      { name: "Foreman's office", readAloud: "A desk, a tally board, and a strongbox bolted to the floor." },
      { name: "Abandoned drift", readAloud: "This tunnel was dug and then given up; the rails end in bare rock." },
    ],
    lairs: [
      { name: "The deep vein", readAloud: "The tunnel opens into a cavern glittering with untouched ore, and something guarding it." },
      { name: "Breakthrough", readAloud: "The miners broke into a natural cave here, and stopped digging very suddenly." },
      { name: "Overseer's hold", readAloud: "A fortified chamber with an iron door and arrow slits facing the tunnel." },
      { name: "Forgotten forge", readAloud: "An ancient forge, older than the mine, its fire somehow still glowing." },
    ],
    entrances: [
      { name: "Adit", readAloud: "A timbered tunnel mouth in the hillside, with rails running in." },
      { name: "Pit bottom", readAloud: "The bottom of the shaft: a ladder up to daylight and a landing of rotten planks." },
      { name: "Spoil-heap cut", readAloud: "A narrow cut behind the spoil heaps, an old way in." },
    ],
  },
};

export const ROOM_DRESSING: string[] = [
  "Scratch marks on the floor, as if something heavy was dragged",
  "A broken lantern that still smells of oil",
  "Old bloodstains on the flagstones",
  "A torn map with a cross drawn in charcoal",
  "The bones of a small animal, picked clean",
  "A wall covered in tally marks",
  "Footprints in the dust: recent, and not human",
  "A smashed crate spilling rotten rope",
  "Cobwebs thick enough to hide in",
  "A puddle that never seems to dry",
  "Burnt-out torches in iron brackets",
  "A cracked mosaic of a forgotten coat of arms",
  "A dropped coin, worn smooth",
  "A rusted helmet with a dent in it",
  "Chalk arrows pointing back the way you came",
  "A heap of rubble from a fallen arch",
  "A nest of rags and straw",
  "A crude warning sign in a language you half know",
  "Wax drippings from many candles",
  "A cold draught from a crack in the wall",
];

export const SENSES: string[] = [
  "It smells of damp earth",
  "It smells of smoke and old fat",
  "A faint, sweet smell of rot",
  "Water drips somewhere close",
  "A distant scraping, then silence",
  "The air is cold enough to see your breath",
  "It is warm and close, almost stuffy",
  "Faint chanting, or the wind",
  "A rhythmic thud, far below",
  "The silence is total",
  "A metallic smell, like blood or old coins",
  "Something skitters away from the light",
];

export const PASSAGE_DRESSING: string[] = [
  "Old cart ruts in the floor",
  "A side niche with a cold candle stub",
  "Water runs along one wall",
  "Claw marks at shoulder height",
  "A tripwire, already cut",
  "A chalk mark: an X in a circle",
  "Loose stones underfoot",
  "A torn banner across the way",
  "A rusty grate in the floor",
  "A carved face above the arch",
];
