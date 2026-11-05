export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(iso);
}

/** What the status and kind menus say (the stored values stay as they are). */
export const ADVENTURE_STATUS_LABELS: Record<"planned" | "active" | "done", string> = { planned: "Planned", active: "Active", done: "Done" };
export const SCENE_STATUS_LABELS: Record<"planned" | "run" | "skipped", string> = { planned: "Planned", run: "Run", skipped: "Skipped" };
export const HANDOUT_KIND_LABELS: Record<"text" | "image" | "card" | "agenda", string> = { agenda: "Agenda card", text: "Text", card: "Card", image: "Image" };

/** Abbreviations a key spells in lower case that read in capitals ("hp" → "HP", "classDc" → "Class DC"). */
const ABBREVIATIONS = new Set(["hp", "ac", "dc", "xp", "gp", "cr", "npc", "npcs", "pc", "pcs", "gm"]);

export function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(" ")
    .map((w) => (ABBREVIATIONS.has(w.toLowerCase()) ? (w.toLowerCase().endsWith("s") && w.length > 2 ? `${w.slice(0, -1).toUpperCase()}s` : w.toUpperCase()) : w))
    .join(" ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** An adventure's display title; a guided draft may not have one yet. */
export function adventureTitle(adventure: { title: string }): string {
  return adventure.title.trim() || "Untitled adventure";
}
