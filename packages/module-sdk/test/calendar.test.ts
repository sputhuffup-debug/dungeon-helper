import { describe, expect, it } from "vitest";
import { addCalendarDays, addDaysToDate, compareCalendarDates, daysBetween, formatAmount, formatCalendarDate, parseCalendarDate, roundAmount } from "../src/calendar";
import type { CalendarDef } from "../src/types";

const gregorian: CalendarDef = {
  id: "g",
  name: "G",
  defaultYear: 2183,
  months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, i) => ({ name: `M${i + 1}`, days })),
  format: "{year}-{month:02}-{day:02}",
};
const odd: CalendarDef = { id: "o", name: "O", defaultYear: 1, months: [{ name: "A", days: 10 }, { name: "B", days: 5 }], format: "{day}/{month}/{year}" };

describe("calendar dates", () => {
  it("round-trips formatted dates in any template", () => {
    expect(parseCalendarDate(gregorian, "2183-06-01")).toEqual({ year: 2183, month: 6, day: 1 });
    expect(formatCalendarDate(gregorian, { year: 2183, month: 6, day: 1 })).toBe("2183-06-01");
    expect(parseCalendarDate(odd, "4/2/3")).toEqual({ year: 3, month: 2, day: 4 });
    expect(parseCalendarDate(odd, "6/2/3")).toBeUndefined();
    expect(parseCalendarDate(gregorian, "2183-13-01")).toBeUndefined();
  });

  it("adds days across months and years, both ways", () => {
    expect(addDaysToDate(gregorian, "2183-06-01", 12)).toBe("2183-06-13");
    expect(addDaysToDate(gregorian, "2183-05-28", -12)).toBe("2183-05-16");
    expect(addDaysToDate(gregorian, "2183-12-25", 54)).toBe("2184-02-17");
    expect(addDaysToDate(gregorian, "2183-03-01", -1)).toBe("2183-02-28");
    expect(addCalendarDays(odd, { year: 1, month: 2, day: 5 }, 1)).toEqual({ year: 2, month: 1, day: 1 });
    expect(addDaysToDate(gregorian, "not a date", 3)).toBe("not a date");
  });

  it("counts and compares", () => {
    expect(daysBetween(gregorian, "2183-12-25", "2184-02-17")).toBe(54);
    expect(compareCalendarDates(gregorian, "2183-02-01", "2183-10-01")).toBeLessThan(0);
    expect(compareCalendarDates(odd, "1/2/1", "10/1/1")).toBeGreaterThan(0);
  });
});

describe("money", () => {
  it("rounds and formats with the currency", () => {
    expect(roundAmount({ decimals: 0 }, 12.6)).toBe(13);
    expect(roundAmount({ decimals: 2 }, 1.006)).toBe(1.01);
    expect(formatAmount({ name: "dollar", symbol: "$" }, 766000)).toBe("$766,000");
    expect(formatAmount({ name: "dollar", symbol: "$" }, -720)).toBe("−$720");
    expect(formatAmount({ name: "dollar", symbol: "$" }, 4000, { sign: true })).toBe("+$4,000");
    expect(formatAmount({ name: "yen", symbol: "¥", symbolAfter: true }, 0, { sign: true })).toBe("0 ¥");
  });
});
