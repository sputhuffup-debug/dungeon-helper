import { formatCalendarDate, type CalendarDef } from "@campaign-forge/module-sdk";

export { formatCalendarDate };

export function defaultCampaignDate(cal: CalendarDef): string {
  return formatCalendarDate(cal, { year: cal.defaultYear, month: 1, day: 1 });
}
