/**
 * Every string enum in the pack gets `enumLabels`, one per value, so selects,
 * sheets, the Atlas and generator inputs show "Lawful good" rather than
 * "lawful-good". A value's label is its entry in LABELS when it has one, else
 * the value in sentence case. An enum that already has labels is left alone.
 */
const LABELS: Readonly<Record<string, string>> = {};

/** "lawful-good" → "Lawful good", "very rare" → "Very rare", "Tiny" → "Tiny". */
export function sentenceCaseId(value: string): string {
  const words = value.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

/** Adds the missing `enumLabels` under `root`, in place, and returns it. */
export function labelEnums<T>(root: T, labels: Readonly<Record<string, string>> = LABELS): T {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const values = rec.enum;
    if (Array.isArray(values) && values.length > 0 && rec.enumLabels === undefined && values.every((v) => typeof v === "string")) {
      rec.enumLabels = (values as string[]).map((v) => labels[v] ?? sentenceCaseId(v));
    }
    for (const v of Object.values(rec)) visit(v);
  };
  visit(root);
  return root;
}
