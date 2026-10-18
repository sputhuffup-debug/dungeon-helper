/**
 * Shore leave event tables (p. 257-258), rolled by a PC who chooses to
 * Socialize during a week of shore leave. Checked against the book: ranges,
 * D6 sub-rolls and money amounts are exact; entries are paraphrased.
 */
import type { RollTable, TableRow } from "@campaign-forge/module-sdk";
import { d6, row } from "./_helpers";

const FAMILY = "shore-leave";

/** Book-checked table: no `unverified` flag on the table or its rows. */
function table(spec: Omit<RollTable, "family">): RollTable {
  return { ...spec, family: FAMILY };
}

interface EventSpec {
  range: [number, number];
  label: string;
  /** Extra structured fields (money, follow-ups). */
  extra?: Record<string, unknown>;
  /** D6 sub-table id rolled for this row. */
  sub?: string;
}

function events(specs: EventSpec[]): TableRow[] {
  return specs.map((s) => row(s.range, s.label, { event: s.label, ...(s.extra ?? {}) }, s.sub ? { roll: [{ table: s.sub, as: "detail" }] } : {}));
}

// ---------------------------------------------------------------------------
// Colonial Marines (p. 257) and its three D6 sub-rolls
// ---------------------------------------------------------------------------

export const marinesLuxuries: RollTable = table({
  id: "alien.shore-leave.marines.luxuries",
  name: "Shore leave: discount officer's luxuries (D6)",
  page: 257,
  dice: "1d6",
  notes: "Sub-roll for the Marines event 24-26.",
  rows: d6([
    { label: "They got away with it", result: { outcome: "got-away" } },
    { label: "They got away with it", result: { outcome: "got-away" } },
    { label: "Logistics are investigating the theft", result: { outcome: "investigated" } },
    { label: "Logistics are investigating the theft", result: { outcome: "investigated" } },
    { label: "Stolen from another company, and they know", result: { outcome: "other-company-knows" } },
    { label: "Stolen from another company, and they know", result: { outcome: "other-company-knows" } },
  ]),
});

export const marinesOldFriend: RollTable = table({
  id: "alien.shore-leave.marines.old-friend",
  name: "Shore leave: an old friend arrives (D6)",
  page: 257,
  dice: "1d6",
  notes: "Sub-roll for the Marines event 41-44.",
  rows: d6([
    { label: "They are in debt", result: { outcome: "in-debt" } },
    { label: "They are in debt", result: { outcome: "in-debt" } },
    { label: "They are in trouble", result: { outcome: "in-trouble" } },
    { label: "They are in trouble", result: { outcome: "in-trouble" } },
    { label: "A money-making offer for the PCs", result: { outcome: "money-offer" } },
    { label: "A money-making offer for the PCs", result: { outcome: "money-offer" } },
  ]),
});

export const marinesLieutenant: RollTable = table({
  id: "alien.shore-leave.marines.lieutenant",
  name: "Shore leave: the lieutenant might be replaced (D6)",
  page: 257,
  dice: "1d6",
  notes: "Sub-roll for the Marines event 45-46.",
  rows: d6([
    { label: "They are being promoted", result: { outcome: "promoted" } },
    { label: "They are being promoted", result: { outcome: "promoted" } },
    { label: "Big trouble, not their fault", result: { outcome: "trouble-not-their-fault" } },
    { label: "Big trouble, not their fault", result: { outcome: "trouble-not-their-fault" } },
    { label: "Big trouble, and definitely their own fault", result: { outcome: "trouble-own-fault" } },
    { label: "Big trouble, and definitely their own fault", result: { outcome: "trouble-own-fault" } },
  ]),
});

export const marines: RollTable = table({
  id: "alien.shore-leave.marines",
  name: "Shore leave events, Colonial Marines",
  page: 257,
  dice: "d66",
  notes: "Roll once for a Colonial Marine PC who chooses to Socialize during a week of shore leave.",
  rows: events([
    { range: [11, 13], label: "The base gym is quiet and the PCs have it to themselves" },
    { range: [14, 16], label: "A Marine from another platoon asks a favor; pays $300, but there might be a catch", extra: { payment: 300 } },
    { range: [21, 23], label: "A fight breaks out and a PC is involved. What was it about?" },
    { range: [24, 26], label: "A logistics sergeant sells some officer's luxuries at a discount", sub: "alien.shore-leave.marines.luxuries" },
    { range: [31, 33], label: "An accident hurts a PC. How, and whose fault was it?" },
    { range: [34, 36], label: "An official ceremony on base; everyone wears dress uniform" },
    { range: [41, 44], label: "An old friend arrives", sub: "alien.shore-leave.marines.old-friend" },
    { range: [45, 46], label: "The PCs' lieutenant might be replaced", sub: "alien.shore-leave.marines.lieutenant" },
    { range: [51, 53], label: "A senior NCO has it in for the platoon and makes shore leave miserable" },
    { range: [54, 56], label: "The base commander cancels the platoon's shore leave at once. What did the unit do?", extra: { leaveCancelled: true } },
    { range: [61, 63], label: "Scheduled training; finishing it earns tickets for laser tag, a movie or the base gym" },
    { range: [64, 66], label: "A platoon member marks a special occasion with an informal dinner and a speech", extra: { followUp: "Roll for a social encounter." } },
  ]),
});

// ---------------------------------------------------------------------------
// Everyone else (p. 258)
// ---------------------------------------------------------------------------

export const others: RollTable = table({
  id: "alien.shore-leave.others",
  name: "Shore leave events, others",
  page: 258,
  dice: "d66",
  notes: "Roll once for a PC who is not a Colonial Marine and chooses to Socialize during a week of shore leave.",
  rows: events([
    { range: [11, 13], label: "A hotel upgrade to executive-level luxury" },
    { range: [14, 16], label: "A side job of a couple of days paying D6 x $200, but is it legal?", extra: { paymentDice: "1d6", paymentPer: 200 } },
    { range: [21, 23], label: "Asteroid miners in port all week cause trouble for officials, travelers and the PCs" },
    { range: [24, 26], label: "A ceremony or celebration at the location" },
    { range: [31, 33], label: "Red tape: the PCs' papers have irregularities. Negotiate or bribe a way out?" },
    { range: [34, 36], label: "A port employee recognizes a PC's skill and offers D6 x $200 to solve a problem", extra: { paymentDice: "1d6", paymentPer: 200 } },
    { range: [41, 44], label: "The PCs overhear scandal about a local official, leader, executive or gangster" },
    { range: [45, 46], label: "A ship the PCs know limps into port, damaged and with casualties. What happened?" },
    { range: [51, 53], label: "A thief targets the PCs' valuables, on them or in their room, and escapes unless spotted" },
    { range: [54, 56], label: "Time with a group of locals yields useful information" },
    {
      range: [61, 63],
      label: "A local commodity on offer for D6 x $400, resellable elsewhere at 50% profit; roll a stress die, a facehugger or a success means a scam",
      extra: { costDice: "1d6", costPer: 400, resaleProfit: 0.5, scamCheck: { die: "stress", scamOn: ["facehugger", "success"] } },
    },
    { range: [64, 66], label: "The PCs find a haven: a beauty spot, quiet lounge or little-known bar, a great place to hide away" },
  ]),
});

export const shoreLeaveTables: RollTable[] = [marines, marinesLuxuries, marinesOldFriend, marinesLieutenant, others];
