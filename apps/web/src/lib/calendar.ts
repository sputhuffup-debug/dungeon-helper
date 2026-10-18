import type { CalendarDef } from "@campaign-forge/module-sdk";

/** Render a date with the calendar's format template ("{year}-{month:02}-{day:02}"). */
export function formatCalendarDate(cal: CalendarDef, date: { year: number; month: number; day: number }): string {
  const format = cal.format ?? "{year}-{month:02}-{day:02}";
  return format.replace(/\{(year|month|day)(?::0(\d))?\}/g, (_m, key: string, pad?: string) => {
    const v = key === "year" ? date.year : key === "month" ? date.month : date.day;
    return pad ? String(v).padStart(Number(pad), "0") : String(v);
  });
}

export function defaultCampaignDate(cal: CalendarDef): string {
  return formatCalendarDate(cal, { year: cal.defaultYear, month: 1, day: 1 });
}
