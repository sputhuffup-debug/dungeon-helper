import type { CalendarDef } from "@campaign-forge/module-sdk";

/** The setting uses the Gregorian calendar. The book's star map is dated 2183 (inside cover) and the setting is the 2180s (p. 108). */
export const calendar: CalendarDef = {
  id: "alien.gregorian",
  name: "Gregorian (2183)",
  defaultYear: 2183,
  months: [
    { name: "January", days: 31 },
    { name: "February", days: 28 },
    { name: "March", days: 31 },
    { name: "April", days: 30 },
    { name: "May", days: 31 },
    { name: "June", days: 30 },
    { name: "July", days: 31 },
    { name: "August", days: 31 },
    { name: "September", days: 30 },
    { name: "October", days: 31 },
    { name: "November", days: 30 },
    { name: "December", days: 31 },
  ],
  weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  format: "{year}-{month:02}-{day:02}",
};
