/**
 * Agenda generator tables (module-original, not from the book): who a
 * character secretly answers to, why, the catch on each act's objective, and
 * generic targets for campaigns that have no people, places or things of
 * their own yet. The generator rolls them per slot; a GM can also roll them
 * by hand from the reference browser. Rows are the module's own words, so
 * they carry no page; `original: true` marks the tables.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, d66Grouped, row, type RowSpec } from "./_helpers";

const FAMILY = "agendas";

export const AGENDA_ALLEGIANCE_TABLE_ID = "alien.agendas.allegiance";
export const AGENDA_MOTIVE_TABLE_ID = "alien.agendas.motive";
export const AGENDA_CATCH_EARLY_TABLE_ID = "alien.agendas.catch-early";
export const AGENDA_CATCH_LATE_TABLE_ID = "alien.agendas.catch-late";
export const AGENDA_ITEM_TABLE_ID = "alien.agendas.fallback-item";
export const AGENDA_PLACE_TABLE_ID = "alien.agendas.fallback-place";
export const AGENDA_NPC_TABLE_ID = "alien.agendas.fallback-npc";
export const AGENDA_THREAT_TABLE_ID = "alien.agendas.fallback-threat";

const original = (t: Omit<RollTable, "original" | "family">): RollTable => ({ ...t, family: FAMILY, original: true });

/**
 * Who they answer to. `owner` is how the card names them ("your debt to the
 * Company"); `internal` allegiances (yourself, a belief) read better without
 * one. "The Company" becomes the corporation the adventure names, if any.
 */
const ALLEGIANCES: RowSpec[] = [
  { label: "The Company", result: { allegiance: "company", owner: "the Company", internal: false } },
  { label: "A rival corporation", result: { allegiance: "rival-corp", owner: "a rival corporation", internal: false } },
  { label: "The Colonial Marshals", result: { allegiance: "marshals", owner: "the Colonial Marshals", internal: false } },
  { label: "A union", result: { allegiance: "union", owner: "your union", internal: false } },
  { label: "Military intelligence", result: { allegiance: "military", owner: "military intelligence", internal: false } },
  { label: "Family", result: { allegiance: "family", owner: "your family", internal: false } },
  { label: "Conscience", result: { allegiance: "conscience", owner: "your conscience", internal: true } },
  { label: "A belief", result: { allegiance: "belief", owner: "your faith", internal: true } },
  { label: "A synthetic's directive", result: { allegiance: "directive", owner: "your makers", internal: false } },
  { label: "A smuggling syndicate", result: { allegiance: "syndicate", owner: "the syndicate", internal: false } },
  { label: "The crew, above all", result: { allegiance: "crew", owner: "the crew", internal: false } },
  { label: "Nobody but themselves", result: { allegiance: "self", owner: "yourself", internal: true } },
];

/** Why they do it: `why` names whom they answer to, `alone` reads without them. */
const MOTIVES: RowSpec[] = [
  { label: "Debt", result: { motive: "debt", why: "your debt to {owner}", alone: "debts you can never pay off" } },
  { label: "Guilt", result: { motive: "guilt", why: "you failed {owner} once and will not again", alone: "guilt over the last time you stood by" } },
  { label: "Ambition", result: { motive: "ambition", why: "everything {owner} promised you if this works", alone: "this is your chance to be somebody" } },
  { label: "Revenge", result: { motive: "revenge", why: "a score to settle, for {owner} and for yourself", alone: "someone here has to pay" } },
  { label: "Someone to protect", result: { motive: "protect", why: "someone you love is in the hands of {owner}", alone: "someone you love is counting on you" } },
  { label: "Curiosity", result: { motive: "curiosity", why: "the answers you owe {owner}", alone: "you have to know what is going on" } },
  { label: "Survival", result: { motive: "survival", why: "a way out alive, if you deliver for {owner}", alone: "you intend to get out of this alive" } },
  { label: "Loyalty", result: { motive: "loyalty", why: "you have never let {owner} down", alone: "you keep your word" } },
  { label: "Faith", result: { motive: "faith", why: "{owner} showed you what matters", alone: "you believe this was meant to happen" } },
  { label: "Orders", result: { motive: "orders", why: "standing orders from {owner}", alone: "a promise you made long ago" } },
  { label: "Pride", result: { motive: "pride", why: "{owner} doubted you, and you will prove them wrong", alone: "no one will call you a failure again" } },
  { label: "Greed", result: { motive: "greed", why: "the bonus {owner} pays for results", alone: "this is worth more than ten years' pay" } },
];

/** The catch on an Act 1 or 2 objective: quiet, no open moves against the crew (p. 158 keeps those for Act 3). */
const CATCH_EARLY: RowSpec[] = [
  { label: "Tell no one what you are doing." },
  { label: "Leave no trace in the logs." },
  { label: "Get it done before this act is over." },
  { label: "Do it without telling an outright lie." },
  { label: "Use only what you carry." },
  { label: "Make it look like someone else's idea." },
  { label: "Make sure someone else would take the blame if it came out." },
  { label: "Do it while the others are busy elsewhere." },
  { label: "Have a cover story ready if anyone asks." },
  { label: "Do not let it slow the crew down." },
  { label: "Get someone else to do the risky part." },
  { label: "Get it done before anyone checks on you." },
];

/** The catch on an Act 3 objective: the gloves come off. `needs: "countdown"` rows apply only when the adventure has a countdown. */
const CATCH_LATE: RowSpec[] = [
  { label: "Even if it costs a life." },
  { label: "Even if it means staying behind." },
  { label: "Whatever the others decide." },
  { label: "Before the countdown runs out.", result: { needs: "countdown" } },
  { label: "In front of everyone: no more hiding." },
  { label: "Even if it costs you your pay." },
  { label: "Even if it means breaking an order." },
  { label: "Even if it means losing your own way out." },
  { label: "Even if the truth about you comes out." },
  { label: "Before anyone else can stop you." },
  { label: "Even if it costs you a friend." },
  { label: "No matter what it costs the crew." },
];

export const agendaTables: RollTable[] = [
  original({
    id: AGENDA_ALLEGIANCE_TABLE_ID,
    name: "Agenda: allegiance",
    dice: "d66",
    rows: d66Grouped(3, ALLEGIANCES),
    notes: "Who the character secretly answers to. The generator steps to the next row that fits the arc dealt.",
  }),
  original({
    id: AGENDA_MOTIVE_TABLE_ID,
    name: "Agenda: motive",
    dice: "d66",
    rows: d66Grouped(3, MOTIVES),
    notes: "Why the character pursues the agenda. The generator steps to the next row that fits the arc dealt.",
  }),
  original({ id: AGENDA_CATCH_EARLY_TABLE_ID, name: "Agenda: catch (Acts 1-2)", dice: "d66", rows: d66Grouped(3, CATCH_EARLY), notes: "The condition on an early objective; keeps it quiet." }),
  original({
    id: AGENDA_CATCH_LATE_TABLE_ID,
    name: "Agenda: catch (Act 3)",
    dice: "d66",
    rows: d66Grouped(3, CATCH_LATE),
    notes: "The condition on the last objective. A countdown row without a countdown steps to the next row.",
  }),
  original({
    id: AGENDA_ITEM_TABLE_ID,
    name: "Agenda: fallback item",
    dice: "d6",
    rows: d6([
      { label: "the specimen", result: { role: "prize", match: "specimen|sample|organism|pod|egg|creature|biolog" } },
      { label: "the flight recorder", result: { role: "records", match: "recorder|black box|flight|crash|wreck" } },
      { label: "the research files", result: { role: "records", match: "research|files|notes|study|data" } },
      { label: "the sample case", result: { role: "prize", match: "case|canister|container|cryo" } },
      { label: "the cargo manifest", result: { role: "records", match: "cargo|manifest|shipment|freight" } },
      { label: "the access keycard", result: { role: "key", match: "keycard|clearance|access code" } },
    ]),
    notes: "Used when the campaign has no key item or clue; a row whose words appear in the adventure's premise or situation is preferred.",
  }),
  original({
    id: AGENDA_PLACE_TABLE_ID,
    name: "Agenda: fallback place",
    dice: "d6",
    rows: d6([
      { label: "the shuttle bay", result: { role: "exit" } },
      { label: "the comms room", result: { role: "comms" } },
      { label: "the reactor room", result: { role: "power" } },
      { label: "the med lab", result: { role: "lab" } },
      { label: "the cargo hold", result: { role: "store" } },
      { label: "the airlock", result: { role: "exit" } },
    ]),
    notes: "Used when the adventure has no locations or site map rooms.",
  }),
  original({
    id: AGENDA_NPC_TABLE_ID,
    name: "Agenda: fallback NPC",
    dice: "d6",
    rows: d6([
      { label: "the station chief", result: { role: "leader" } },
      { label: "the company liaison" },
      { label: "the last survivor" },
      { label: "the ship's doctor" },
      { label: "the quartermaster" },
      { label: "the stowaway" },
    ]),
    notes: "Used when the adventure has no NPCs.",
  }),
  original({
    id: AGENDA_THREAT_TABLE_ID,
    name: "Agenda: fallback threat",
    dice: "d6",
    rows: [row([1, 3], "the creature"), row([4, 5], "the thing in the vents"), row([6, 6], "the organism")],
    notes: "Used when the campaign names no creature.",
  }),
];
