/**
 * Shore leave event tables (p. 257-258): one for Colonial Marines, one for
 * everyone else. A few rows nest a D6 sub-roll. Rows are unverified
 * paraphrases.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, d66Grouped, defineTable } from "./_helpers";

const FAMILY = "shore-leave";

export const marinesTrouble: RollTable = defineTable({
  id: "alien.shore-leave.marines.trouble",
  name: "Shore leave: marine trouble",
  family: FAMILY,
  page: 258,
  dice: "1d6",
  rows: d6([
    { label: "A black eye and a story", result: { outcome: "bruised" } },
    { label: "A night in the brig", result: { outcome: "brig" } },
    { label: "Lost a week's pay", result: { outcome: "lost-pay", cash: -500 } },
    { label: "Made a new rival", result: { outcome: "rival" } },
    { label: "Made a new buddy", result: { outcome: "buddy" } },
    { label: "Got away clean", result: { outcome: "clean" } },
  ]),
});

export const marinesRumor: RollTable = defineTable({
  id: "alien.shore-leave.marines.rumor",
  name: "Shore leave: barracks rumour",
  family: FAMILY,
  page: 258,
  dice: "1d6",
  rows: d6([
    { label: "A unit went missing on the frontier", result: { rumor: "missing-unit" } },
    { label: "The Company is hiring deserters", result: { rumor: "company-deserters" } },
    { label: "A new posting is coming", result: { rumor: "new-posting" } },
    { label: "Someone saw a Company lab ship", result: { rumor: "lab-ship" } },
    { label: "An officer is under investigation", result: { rumor: "officer-investigated" } },
    { label: "The UPP are massing somewhere", result: { rumor: "upp-massing" } },
  ]),
});

export const marines: RollTable = defineTable({
  id: "alien.shore-leave.marines",
  name: "Shore leave events: Colonial Marines",
  family: FAMILY,
  page: [257, 258],
  dice: "d66",
  notes: "Roll once per marine who chooses to socialise during a shore leave week.",
  rows: d66Grouped(2, [
    { label: "Bar fight", result: { event: "Bar fight", stress: 0 }, roll: [{ table: "alien.shore-leave.marines.trouble", as: "trouble" }] },
    { label: "Won big at cards", result: { event: "Won big at cards", cash: 500 } },
    { label: "Lost big at cards", result: { event: "Lost big at cards", cash: -500 } },
    { label: "Heard a rumour", result: { event: "Heard a rumour" }, roll: [{ table: "alien.shore-leave.marines.rumor", as: "rumor" }] },
    { label: "Extra duty for a prank", result: { event: "Extra duty for a prank" } },
    { label: "A romance, short and sweet", result: { event: "A romance, short and sweet", stress: -1 } },
    { label: "Caught in a riot", result: { event: "Caught in a riot", stress: 1 }, roll: [{ table: "alien.shore-leave.marines.trouble", as: "trouble" }] },
    { label: "Met an old squadmate", result: { event: "Met an old squadmate" } },
    { label: "Recruited for a side job", result: { event: "Recruited for a side job" } },
    { label: "A tattoo you do not remember", result: { event: "A tattoo you do not remember" } },
    { label: "Quiet week, rested", result: { event: "Quiet week, rested", stress: -1 } },
    { label: "A letter from home", result: { event: "A letter from home" } },
    { label: "Picked up by the MPs", result: { event: "Picked up by the MPs" }, roll: [{ table: "alien.shore-leave.marines.trouble", as: "trouble" }] },
    { label: "Bought new gear on the cheap", result: { event: "Bought new gear on the cheap", cash: -200 } },
    { label: "Got a commendation in the mail", result: { event: "Got a commendation in the mail" } },
    { label: "A Company recruiter made an offer", result: { event: "A Company recruiter made an offer" } },
    { label: "Nightmares every night", result: { event: "Nightmares every night", stress: 1 } },
    { label: "Made a friend in the right place", result: { event: "Made a friend in the right place" } },
  ]),
});

export const others: RollTable = defineTable({
  id: "alien.shore-leave.others",
  name: "Shore leave events: everyone else",
  family: FAMILY,
  page: [257, 258],
  dice: "d66",
  notes: "Roll once per non-marine character who chooses to socialise during a shore leave week.",
  rows: d66Grouped(2, [
    { label: "A job offer from a stranger", result: { event: "A job offer from a stranger" } },
    { label: "Robbed in a back alley", result: { event: "Robbed in a back alley", cash: -300, stress: 1 } },
    { label: "A good week, nothing went wrong", result: { event: "A good week, nothing went wrong", stress: -1 } },
    { label: "Reunited with family", result: { event: "Reunited with family", stress: -1 } },
    { label: "Heard a rumour about the Company", result: { event: "Heard a rumour about the Company" } },
    { label: "Won a bet", result: { event: "Won a bet", cash: 400 } },
    { label: "A medical bill", result: { event: "A medical bill", cash: -400 } },
    { label: "An old debt collected", result: { event: "An old debt collected", cash: -500 } },
    { label: "A short romance", result: { event: "A short romance", stress: -1 } },
    { label: "Questioned by a marshal", result: { event: "Questioned by a marshal", stress: 1 } },
    { label: "Sold something for a good price", result: { event: "Sold something for a good price", cash: 300 } },
    { label: "Met a useful contact", result: { event: "Met a useful contact" } },
    { label: "Lost a friend to a transfer", result: { event: "Lost a friend to a transfer" } },
    { label: "Got sick from the local food", result: { event: "Got sick from the local food" } },
    { label: "A corporate agent asked questions", result: { event: "A corporate agent asked questions", stress: 1 } },
    { label: "Learned a new trick from a local", result: { event: "Learned a new trick from a local" } },
    { label: "Can't sleep, keep seeing it", result: { event: "Can't sleep, keep seeing it", stress: 1 } },
    { label: "Found a place that felt like home", result: { event: "Found a place that felt like home", stress: -1 } },
  ]),
});

export const shoreLeaveTables: RollTable[] = [marines, marinesTrouble, marinesRumor, others];
