import type { AlienPreset } from "./types";
import { minorCorporationRows } from "./minor-corporations";

/**
 * Faction presets (Evolved Edition p. 162-177): eight major entries with the
 * book's section headings as fields, plus the ten minor corporations as
 * `minor: true` presets. Short descriptors only, from general knowledge of
 * the setting; flagged `unverified`.
 */

type FactionType = "corporation" | "government" | "military" | "colonial" | "other";
type Allegiance = "uas" | "3we" | "upp" | "icsc" | "independent" | "unknown";

interface FactionSpec {
  id: string;
  name: string;
  summary: string;
  page: number | [number, number];
  factionType: FactionType;
  allegiance: Allegiance;
  history: string;
  products: string;
  military: string;
  leaders: string;
  locations: string;
  relations: string;
  currentActivities: string;
  reputation: number;
  notableNpc: { name: string; role: string; hook: string };
  tags?: string[];
}

function faction(spec: FactionSpec): AlienPreset {
  const { id, name, summary, page, tags = [], ...fields } = spec;
  return {
    id: `alien.faction.${id}`,
    entityType: "alien.faction",
    name,
    summary,
    page,
    tags: ["faction", "major", `allegiance:${fields.allegiance}`, ...tags],
    fields: { ...fields, minor: false },
    unverified: true,
  };
}

export const majorFactionPresets: AlienPreset[] = [
  faction({
    id: "weyland-yutani",
    name: "Weyland-Yutani Corporation",
    summary: "The Company. Building better worlds, whatever the cost.",
    page: [164, 165],
    factionType: "corporation",
    allegiance: "uas",
    history: "Merger of Weyland Corp and the Yutani Corporation; the oldest and largest interstellar conglomerate, present on every colonized world.",
    products: "Terraforming, starships, synthetics, colony administration, pharmaceuticals, weapons research.",
    military: "Private security forces, corporate warships on paper, USCMC contracts in practice.",
    leaders: "A board that is never seen; regional directors with wide discretion.",
    locations: "Earth, Gateway Station, every major colony; special projects on sealed worlds.",
    relations: "Partner and rival of the United Americas; competitor of Seegson; hostile to the UPP.",
    currentActivities: "Acquiring alien specimens under Special Order protocols; expanding the frontier faster than the Colonial Administration can regulate it.",
    reputation: 2,
    notableNpc: { name: "Director Ashford Blake", role: "Regional Director, Frontier Operations", hook: "Signs the Special Orders that make crews expendable." },
  }),
  faction({
    id: "seegson",
    name: "Seegson Corporation",
    summary: "Second-rate synthetics and third-rate stations, sold at a discount.",
    page: [166, 167],
    factionType: "corporation",
    allegiance: "uas",
    history: "Grew from European heavy industry; always a step behind Weyland-Yutani and desperate to catch up.",
    products: "Working Joe synthetics, APOLLO station systems, cheap habitats, mining equipment.",
    military: "Station security contractors; no fleet of its own.",
    leaders: "A family-controlled board losing ground to outside investors.",
    locations: "Sevastopol-type stations, Outer Veil mining concerns, Europe.",
    relations: "Bitter rival of Weyland-Yutani; sells to anyone, including the UPP.",
    currentActivities: "Decommissioning failing stations; quietly buying salvage rights to derelicts.",
    reputation: 0,
    notableNpc: { name: "Ingrid Sorensen", role: "Station Operations Executive", hook: "Will trade a derelict's coordinates for a way out of a failing contract." },
  }),
  faction({
    id: "united-americas",
    name: "United Americas and the USCMC",
    summary: "The American arm: a continental government and its Colonial Marine Corps.",
    page: [168, 169],
    factionType: "government",
    allegiance: "uas",
    history: "Union of the American continents; the dominant human power and the Company's closest partner.",
    products: "Colonial charters, trade law, the dollar.",
    military: "United States Colonial Marine Corps: dropships, APCs, Conestoga-class transports; stretched across the arm.",
    leaders: "An elected administration beholden to corporate donors; USCMC general staff.",
    locations: "Earth, Luna, Mars, the American Arm colonies.",
    relations: "Cold war with the UPP; uneasy treaty with the Three World Empire; polices the ICSC border.",
    currentActivities: "Responding to colony blackouts on the frontier; rotating marine units into the Outer Rim.",
    reputation: 1,
    notableNpc: { name: "Lieutenant Colonel Rosa Vance", role: "USCMC Battalion Commander", hook: "Wants to know why her squads keep being seconded to Company science teams." },
  }),
  faction({
    id: "three-world-empire",
    name: "Three World Empire",
    summary: "Britain, Japan and allied worlds under a constitutional crown.",
    page: [170, 171],
    factionType: "government",
    allegiance: "3we",
    history: "Formed from the United Kingdom, Japan and their off-world holdings; home of the Yutani half of the Company.",
    products: "Finance, shipping, high-end synthetics, culture.",
    military: "Royal Marines and a modern but small fleet; relies on treaty with the UA.",
    leaders: "The Crown, an elected parliament, and the Jingti Long and Yutani boards behind both.",
    locations: "Earth (Britain, Japan), the Imperial Arm, Tientsin.",
    relations: "Allied with the UA; trading partner of the ICSC; suspicious of the UPP.",
    currentActivities: "Expanding the Imperial Arm through chartered corporations; quietly funding exploration beyond the Far Reach.",
    reputation: 1,
    notableNpc: { name: "Commander Hana Yoshida", role: "Royal Navy liaison officer", hook: "Carries a diplomatic pouch she is not supposed to open." },
  }),
  faction({
    id: "upp",
    name: "Union of Progressive Peoples",
    summary: "The socialist bloc: proud, paranoid and short on spare parts.",
    page: [172, 173],
    factionType: "government",
    allegiance: "upp",
    history: "Formed from Russia, China and allied states after a century of cold wars; expanded along its own arm in isolation.",
    products: "Heavy industry, AK-4047 rifles, rugged ships, state science.",
    military: "A large, aging fleet and well-drilled infantry; commissars in every unit.",
    leaders: "The Central Committee and the Directorate of State Security.",
    locations: "Rodina, the UPP Arm, border worlds along the Outer Veil.",
    relations: "Hostile to the UA and the Company; trades grudgingly with Seegson and the ICSC.",
    currentActivities: "Hunting for the same alien specimens the Company wants; running defector networks on frontier colonies.",
    reputation: 0,
    notableNpc: { name: "Captain Yuri Dolgov", role: "UPP cruiser commander", hook: "Has orders to seize any xenobiological asset and no orders about witnesses." },
  }),
  faction({
    id: "icsc",
    name: "Independent Core System Colonies",
    summary: "A loose league of colonies that bought their freedom and guard it jealously.",
    page: [174, 175],
    factionType: "colonial",
    allegiance: "icsc",
    history: "Colonies that broke from the arms after a trade war; held together by mutual defense pacts and GeoFund credit.",
    products: "Agriculture, ore, free ports, cheap registrations for ships that want no questions.",
    military: "Colonial militias and a handful of surplus corvettes.",
    leaders: "A rotating council of colony governors.",
    locations: "ICSC space between the American and Imperial Arms.",
    relations: "Neutral toward the UA and 3WE; wary of the Company; harbors UPP defectors.",
    currentActivities: "Fighting corporate land grabs with lawyers and, when needed, militia.",
    reputation: 1,
    notableNpc: { name: "Governor Teodora Mbeki", role: "Council Chair, ICSC", hook: "Needs an independent crew to prove the Company is dumping failed experiments on her worlds." },
  }),
  faction({
    id: "colonial-administration",
    name: "Colonial Administration",
    summary: "The civil service of the frontier: charters, marshals, quarantine law.",
    page: [175, 176],
    factionType: "government",
    allegiance: "uas",
    history: "Created to govern colonies on behalf of Earth governments; outsourced piece by piece to the corporations it was meant to regulate.",
    products: "Colony charters, customs, Interstellar Commerce Commission rulings, marshal appointments.",
    military: "Colonial Marshals and customs cutters; calls on the USCMC for anything bigger.",
    leaders: "Colonial Secretaries appointed by the UA and 3WE; an Inspector General nobody listens to.",
    locations: "Administrative hubs at Gateway, Anchorpoint and sector capitals.",
    relations: "Captured by the Company; respected by colonists who have no one else.",
    currentActivities: "Investigating colony disappearances; auditing Company terraforming claims.",
    reputation: 1,
    notableNpc: { name: "Inspector Dalia Reyes", role: "ICC quarantine inspector", hook: "The only official on the frontier who still files her reports honestly." },
  }),
  faction({
    id: "church-of-immaculate-incubation",
    name: "Church of Immaculate Incubation",
    summary: "A frontier cult that worships the perfect organism and seeks to host it.",
    page: 177,
    factionType: "other",
    allegiance: "independent",
    history: "Grew from survivor groups and grieving colonists who saw something holy in what killed their families.",
    products: "Devotion, shelter for the desperate, smuggled specimens.",
    military: "Fanatical followers; no formal force, but they do not fear death.",
    leaders: "A charismatic Prophet whose face has never been recorded.",
    locations: "Hidden chapels on Outer Rim colonies and in derelict stations.",
    relations: "Hunted by the Colonial Administration; quietly used by the Company as a source of specimens.",
    currentActivities: "Seeking eggs; preparing a mass incubation on a world they call the Cradle.",
    reputation: -2,
    notableNpc: { name: "Brother Elias Thorne", role: "Missionary and recruiter", hook: "Offers a frightened crew the only peace left in the dark." },
    tags: ["cult"],
  }),
];

export const minorFactionPresets: AlienPreset[] = minorCorporationRows.map((corp) => ({
  id: `alien.faction.${corp.id}`,
  entityType: "alien.faction",
  name: corp.name,
  summary: corp.summary,
  page: [176, 177] as [number, number],
  tags: ["faction", "minor", "corporation", `allegiance:${corp.allegiance}`],
  fields: {
    factionType: "corporation",
    allegiance: corp.allegiance,
    history: "",
    products: corp.sector,
    military: "",
    leaders: "",
    locations: corp.headquarters,
    relations: "",
    currentActivities: "",
    reputation: 0,
    minor: true,
    sector: corp.sector,
  },
  unverified: true,
}));

export const factionPresets: AlienPreset[] = [...majorFactionPresets, ...minorFactionPresets];
