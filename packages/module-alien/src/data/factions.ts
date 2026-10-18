import type { PageRef } from "@campaign-forge/module-sdk";
import type { AlienPreset } from "./types";
import { MINOR_CORPORATIONS_PAGE, minorCorporationRows } from "./minor-corporations";

/**
 * Faction presets.
 *
 * - The eight entries of the Governments & Corporations chapter (Evolved
 *   Edition p. 162-177), each with the book's section headings as fields and
 *   its featured NPC: Three World Empire, United Americas, Union of
 *   Progressive Peoples, Independent Core System Colonies, Interstellar
 *   Commerce Commission, Weyland-Yutani, Lasalle Bionational, Seegson.
 * - Two further organizations the book describes elsewhere: the Colonial
 *   Administration (a UA division, p. 166) and the Church of Immaculate
 *   Incubation (p. 120).
 * - The ten minor corporations of p. 162 as `minor: true` presets.
 *
 * Checked against the book. Section texts are short paraphrases; a section
 * the book does not give for an entry is an empty string. Names and titles
 * of featured NPCs are data. `allegiance` follows the book where it says so;
 * for corporations it records their home bloc (W-Y British-Japanese, Lasalle
 * American, Seegson trading with everyone), a module reading of the text.
 * `reputation` is a module convention (the crew's standing), so every preset
 * starts at 0.
 */

type FactionType = "corporation" | "government" | "military" | "colonial" | "other";
type Allegiance = "uas" | "3we" | "upp" | "icsc" | "independent" | "unknown";

interface FactionSpec {
  id: string;
  name: string;
  summary: string;
  page: PageRef;
  /** "major": a chapter entry; "organization": described elsewhere in the book. */
  kind: "major" | "organization";
  factionType: FactionType;
  allegiance: Allegiance;
  history: string;
  products: string;
  military: string;
  leaders: string;
  locations: string;
  relations: string;
  currentActivities: string;
  notableNpc?: { name: string; role: string; hook: string };
  tags?: string[];
}

function faction(spec: FactionSpec): AlienPreset {
  const { id, name, summary, page, kind, tags = [], notableNpc, ...fields } = spec;
  return {
    id: `alien.faction.${id}`,
    entityType: "alien.faction",
    name,
    summary,
    page,
    tags: ["faction", kind, `allegiance:${fields.allegiance}`, ...tags],
    fields: { ...fields, reputation: 0, minor: false, ...(notableNpc ? { notableNpc } : {}) },
  };
}

export const majorFactionPresets: AlienPreset[] = [
  faction({
    id: "three-world-empire",
    name: "The Three World Empire",
    summary: "The most technologically advanced superpower, with the oldest colonies; deeply entwined with Weyland-Yutani.",
    page: [163, 164],
    kind: "major",
    factionType: "government",
    allegiance: "3we",
    history: "The first of the merged nations: the UK, Japan, India and several developing countries joined in the 2080s, building on the pioneering of Weyland Corp and Yutani. Its three worlds are Earth, Mars and Titan.",
    products: "",
    military: "Its Frontier colonies rely on the USCMC by treaty. It keeps a large navy and the small, well-equipped Royal Marines Commandos, topped up with W-Y contract soldiers.",
    leaders: "A parliamentary social democracy under a figurehead monarchy of merged British and Japanese royals, led by an elected Prime Minister. Frontier worlds answer to a provisional governor.",
    locations: "Sol holdings plus most colonies of the Outer Veil and Core Systems, with a limited push into the Outer Rim and Frontier: the Anglo-Japanese Arm. Notable: Corona Colony, Gorham's Folly, Fiorina 161, Linna 349.",
    relations: "W-Y holds a seat in parliament, and rumor says some MPs are android duplicates. Mostly at peace with the UA, which watches 3WE expansion closely; caught between the UA and W-Y.",
    currentActivities: "Rumored to be getting an orbital bioweapon from W-Y. It prefers the status quo to war and fears it may have to rein the company in.",
    notableNpc: { name: "Vihaa Reddy", role: "Provisional Governor of the Frontier Colonies of the Three World Empire", hook: "Well-meaning but sheltered; moved her family to the Frontier, takes grievances as personal affronts and wants the UA out of Linna 349." },
  }),
  faction({
    id: "united-americas",
    name: "The United Americas",
    summary: "The strongest starfaring and colonizing nation, backed by the Colonial Marines.",
    page: [164, 167],
    kind: "major",
    factionType: "government",
    allegiance: "uas",
    history: "Formed in 2104 from North, Central and South America under the Washington Treaty to rival the 3WE. Its two-year war against the J'Har rebels of Torin Prime cemented its power.",
    products: "",
    military: "United Americas Allied Command: USCMC, Canadian Colonial Armed Forces, Latin American Colonial Navy, US AeroSpace Force and the Outer Rim Defense Fleet. Divisions include the Colonial Administration and Colonial Marshal Bureau.",
    leaders: "In effect an extension of the US government: a President, Vice President and Congress. On the Frontier, expect a Colonial Marshal, a Colonial Administration bureaucrat or a marine commander.",
    locations: "The American Arm of the Outer Rim Territories, with bases across all territories and colonies along the Frontier. Key worlds: Bracken's World, Terraform 3, Morning Glory, the Crestus Garrison Systems.",
    relations: "Decades of cold war with the UPP. Treaties oblige it to protect 3WE and ICSC worlds too, and W-Y business ties mean marines can be ordered to guard company assets.",
    currentActivities: "Border clashes with the UPP and missing USCMC units under investigation. Evidence points to W-Y in the loss of Hadley's Hope on LV-426; a rift with W-Y could drag in the 3WE.",
    notableNpc: { name: "Aeron Percival", role: "Colonel, Commander 4th Recon Battalion, 7th Marines, Crestus Garrison System Delta, USCMC", hook: "A pragmatic strategist who fears the Corps has grown complacent and expects a stronger enemy out there; leads from the front." },
  }),
  faction({
    id: "upp",
    name: "The Union of Progressive Peoples",
    summary: "A poor, crowded socialist superpower locked in cold war with the UA.",
    page: [167, 169],
    kind: "major",
    factionType: "government",
    allegiance: "upp",
    history: "Formed by China and Russia in the early 22nd century against the 3WE and UA; members include Vietnam, Germany and Spain. It deals with no corporations, and its androids are state property.",
    products: "",
    military: "Space Operating Forces: elite commandos on par with the USCMC, with warships, dropships, armored trucks, AK pulse rifles and wrist-mounted suit guns. The Ministry of Space Security runs spies and secret police.",
    leaders: "A president as head of state and a premier over the state council. The UPP Frontier has a Governor General and a naval task force; each colony has a mayor.",
    locations: "Mostly resource-poor worlds; it does not terraform, building domes or underground instead. Notable: New Kiev, Qi Xi III, 17 Phei Phei, Xiang Colony, the Chiu and Wan An outposts.",
    relations: "Cold war with the UA, including the ruinous Tientsin campaign on 8 Eta Boötis A III. Rumored to have destroyed Hadley's Hope; much of its tech is reverse engineered from W-Y.",
    currentActivities: "Sends colony ships to every promising Frontier world to relieve overcrowding, relocating citizens without asking. UA border posts keep mistaking colony fleets for invasions.",
    notableNpc: { name: "Pham Dinh", role: "Governor General of the UPP Frontier Colonies", hook: "A veteran navy commander near retirement who sees the post as punishment, yet will fight for every rich world she can claim for her people." },
  }),
  faction({
    id: "icsc",
    name: "The Independent Core System Colonies",
    summary: "A loose alliance of independent worlds protected, for a fee, by corporate forces.",
    page: [169, 170],
    kind: "major",
    factionType: "colonial",
    allegiance: "icsc",
    history: "Began in the 2080s as the Central Space Consortium, corporations dodging Earth taxes. It rebranded to sell protection to any colony that wanted independence and could pay; banks and credit firms followed.",
    products: "Protection for paying colonies, asylum bought for useful fugitives, and banking and bonds for corporations. Members include W-Y, Seegson, Chigusa, Hyperdyne and Jĭngtì Lóng.",
    military: "A combined security fleet of mercenaries from member corporations: deadly in small units, poor at fleet actions and coordinated defense.",
    leaders: "The Central Space Consortium: a board with one director per major corporation and one for the outer colonies, whose office sends a touring representative.",
    locations: "New Eden Sector in the Core: Volcus, Ventix, Grendel, and the colonies Alexandria, Exeter and St. John. Beyond it, the Solomons and Anchorpoint Station.",
    relations: "Under UA and 3WE trade sanctions and heavy taxes. A major USCMC base sits just outside, yet the Consortium also contracts national forces for protection.",
    currentActivities: "Members jointly run a huge smuggling ring and black market. Recruiters secretly urge successful colonies to defect, which is illegal and watched by the Colonial Administration.",
    notableNpc: { name: "Martin", role: "Liaison/Recruiter, Central Space Consortium, Independent Core System Colonies", hook: "An android so warm few notice; now sees his masters as con artists and is heading for a programming breakdown." },
  }),
  faction({
    id: "icc",
    name: "Interstellar Commerce Commission",
    summary: "The trade and quarantine regulator, allegedly autonomous and actually owned by Weyland-Yutani.",
    page: 171,
    kind: "major",
    factionType: "other",
    allegiance: "independent",
    history: "After disease outbreaks on stations and Luna, the UA and 3WE talked of regulation; W-Y set up the ICC first, arguing self-regulation was better, and the governments let it be.",
    products: "Spacedock inspections, cargo seizures and the licenses every commercial crew member needs; quarantine rules for Earth and every colony over 200,000 people.",
    military: "Inspection teams and coast guard cutters at every major station of the UA, 3WE and ICSC, plus patrols on the UPP border.",
    leaders: "A board with representatives of every major corporation and government; it sends an executive to mediate important matters.",
    locations: "Headquarters on KOI 812.03 \"Ruby Colony\", the largest spaceport in the Outer Veil.",
    relations: "Claims loyalty to no one, but is owned and operated by Weyland-Yutani.",
    currentActivities: "With rumors of alien life and pathogens spreading, it is cracking down on ships back from deep space and the Frontier.",
    notableNpc: { name: "Paul van Leuwen", role: "Executive, Interstellar Commerce Commission", hook: "Chaired Ripley's Nostromo hearing; now doubts his verdict and runs his own inquiry, shuttling in and out of Anchorpoint." },
  }),
  faction({
    id: "weyland-yutani",
    name: "Weyland-Yutani",
    summary: "The British-Japanese conglomerate that dominates the stars: the Company.",
    page: [172, 174],
    kind: "major",
    factionType: "corporation",
    allegiance: "3we",
    history: "Born at the turn of the century from Weyland Corp and the Yutani Corporation after both suffered setbacks; who took over whom is kept murky. Back in terraforming by the 2130s, it became the UA's chief weapons and starship supplier.",
    products: "Synthetics, spaceships, computers and weapons; deep space mining, shipping, terraforming and colonies; and an R&D division for biological and chemical weapons.",
    military: "The Dog Catchers: commando teams (four commandos, two containment specialists, a science team, a chief surgeon, often led by an exec) in APEsuits with pulse rifles and capture gear (+2 to grapple).",
    leaders: "A board and shareholders, rumored to be steered by synthetics following Peter Weyland's old directives. On the Frontier the real man in charge is Michael Bishop.",
    locations: "Main offices in Tokyo, London, San Francisco, the Sea of Tranquility and Thedus; a presence at every major starport; holdings on Alexandria; dozens of colonies, terraforming and mining projects.",
    relations: "Buys or destroys rivals. Sits on the ICC's Company Review Board yet bribes ICC agents and marshals to dodge inspections. Its uneasy alliance with the UA strains ties with the 3WE.",
    currentActivities: "Secret labs pursue Chemical A0-3959X.91-15 and P. praepotens as weapons, at stations like RB-232 \"The Cold Forge\" and Kathar Station. Also X-stimulants, exo-suits and combat androids for the USCMC.",
    notableNpc: { name: "Michael Bishop", role: "Director of Special Projects, Bio-Weapons R&D, and Synthetic Design", hook: "Creator of the Bishop androids, injured at Fiorina 161 and hooked on painkillers, chasing a live XX121; his ship Patna docks at Anchorpoint." },
  }),
  faction({
    id: "lasalle-bionational",
    name: "Lasalle Bionational",
    summary: "A family-run biotech conglomerate racing Weyland-Yutani for bioweapons contracts.",
    page: 175,
    kind: "major",
    factionType: "corporation",
    allegiance: "uas",
    history: "Founded in the late 2130s by W-Y vice president Brendan Lasalle with laid-off W-Y researchers. Early government contracts: a radiation-resistant corn substitute and a crop-killing blight virus.",
    products: "Radiation-resistant crops, bioengineered livestock tailored to environments, extrasolar pathogen vaccines, and a biological research, procurement and weapons division.",
    military: "Science and security exploration teams; less well protected than W-Y.",
    leaders: "The Lasalle family holds a majority of shares, passed from father to daughter, alongside a board of directors.",
    locations: "Home offices in Texas, Columbia and French Polynesia; sterile research stations in the Outer Veil; sponsor of Taurus 7 and LV-113; a farming colony on Terraform 3 and SEVs out of Anchorpoint Station.",
    relations: "In a bio-arms race with W-Y for USCMC contracts, with espionage and sabotage both ways. UPP spies sit inside its administration.",
    currentActivities: "Holds its own XX121 eggs and has bred a hive for study in the Taurus system. Its teams search the Frontier for Engineer labs, the black accelerant and other alien life.",
    notableNpc: { name: "Edina Lasalle", role: "CEO of Lasalle Bionational", hook: "The founder's coolly logistical daughter, inspecting every facility in person and seeking someone with the right skills to protect the company." },
  }),
  faction({
    id: "seegson",
    name: "Seegson",
    summary: "A European maker of cheap alternatives to Weyland-Yutani products, forever in its shadow.",
    page: [176, 177],
    kind: "major",
    factionType: "corporation",
    allegiance: "independent",
    history: "Founded as Sieg and Son in the 2030s to rival Weyland Corp; it shared its FTL drive patent widely and became Seegson by the 2070s. Betting on orbital stations instead of terraforming crippled it; by 2140 most stations were for sale.",
    products: "Security and communications, credit services, the A.P.O.L.L.O. AI mainframe, space and ground vehicles, pharmaceuticals and Working Joe synthetics: cheaper than W-Y, and seen as inferior.",
    military: "",
    leaders: "A publicly traded company run by a board. On the Frontier, Director James Russell looks after its interests from Anchorpoint Station.",
    locations: "Offices at every major spaceport in the Core, Outer Veil and Outer Rim; home offices in London, Buenos Aires, Nagasaki, on Luna, the Solomons and Anchorpoint; a few deep space R&D stations.",
    relations: "Lucrative contracts with the ICSC and 3WE; affiliates include Geofund, Gemini Exoplanet Solutions and Gustafsson Enterprise Ltd. W-Y does not see it as a threat. It also wants XX121 specimens.",
    currentActivities: "Sabotaging W-Y on the Frontier. A shipment of Working Joes went to an anonymous Frontier buyer without behavior inhibitors.",
    notableNpc: { name: "James Evans-Russell", role: "Director of Frontier Operations", hook: "A western-film buff who sees the Frontier as the Old West and leaves his office whenever he can, but always toes the company line." },
  }),
  faction({
    id: "colonial-administration",
    name: "Colonial Administration",
    summary: "The UA division that supports and monitors UA colonies; its marshals police them.",
    page: 166,
    kind: "organization",
    factionType: "government",
    allegiance: "uas",
    history: "Formed by the United Americas to protect the rights of off-world colonists.",
    products: "",
    military: "Its law enforcement arm is the Colonial Marshal Bureau, which polices the colonies and works with the ICC against dangerous biologicals and chemicals; every major marshal office has an ICC agent.",
    leaders: "A division of the United Americas government.",
    locations: "Supports and monitors all UA extrasolar colonies and stations.",
    relations: "Has fought for decades for a colonist minimum wage, blocked by corporate lobbyists. Watches ICSC recruiters closely (p. 170).",
    currentActivities: "Keeps supply chains running, vaccines distributed and a semblance of order in the colonies.",
    tags: ["division"],
  }),
  faction({
    id: "church-of-immaculate-incubation",
    name: "Church of Immaculate Incubation",
    summary: "A small apocalyptic cult that preaches transformation through the \"Seed of God\".",
    page: 120,
    kind: "organization",
    factionType: "other",
    allegiance: "independent",
    history: "A fledgling group, possibly a splinter of the century-old Earthsavers cult founded by the prophet Duncan Fields.",
    products: "Illegal copies of Robert Morse's banned book Space Beast.",
    military: "",
    leaders: "Fanatical seers, and an enigmatic leader rumored to be a wealthy man who gave up his comforts to fund the Church.",
    locations: "Scattered through the colonies.",
    relations: "Seen as essentially harmless: few members, nothing to back its claims.",
    currentActivities: "Preaches that only those transformed into a higher form survive the coming end times; recruits professional dreamers.",
    tags: ["cult"],
  }),
];

export const minorFactionPresets: AlienPreset[] = minorCorporationRows.map((corp) => ({
  id: `alien.faction.${corp.id}`,
  entityType: "alien.faction",
  name: corp.name,
  summary: corp.summary,
  page: MINOR_CORPORATIONS_PAGE,
  tags: ["faction", "minor", "corporation", `allegiance:${corp.allegiance}`],
  fields: {
    factionType: "corporation",
    allegiance: corp.allegiance,
    history: "",
    products: corp.sector,
    military: "",
    leaders: "",
    locations: corp.headquarters ?? "",
    relations: "",
    currentActivities: "",
    reputation: 0,
    minor: true,
    sector: corp.sector,
  },
}));

export const factionPresets: AlienPreset[] = [...majorFactionPresets, ...minorFactionPresets];
