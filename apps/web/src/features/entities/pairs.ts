/**
 * Saving a sheet whose paired fields (`SheetField.reciprocal`, e.g. a buddy)
 * changed someone else too: say so, and offer to repoint a partner who
 * names someone else ("Dov's buddy is still Sefa. Make it Rhea").
 */
import { clone, setPath, type Entity, type Id } from "@campaign-forge/core";
import { pushToast } from "../../components/ui";
import { saveEntityFields, type SavedFields } from "../../state/actions";
import type { useCampaign } from "../../state/hooks";
import { sheetFieldOf } from "./summary";

type Ctx = ReturnType<typeof useCampaign>;

/** Save the sheet and tell the GM what its pairs did. */
export function saveSheet(ctx: Ctx, id: Id, fields: Record<string, unknown>, changedPaths: string[] = []): SavedFields {
  const saved = saveEntityFields(ctx, id, fields, changedPaths);
  reportPairs(ctx, saved.entity, saved);
  return saved;
}

/** One toast per partner changed or left alone. */
export function reportPairs(ctx: Ctx, self: Entity, saved: Pick<SavedFields, "edits" | "conflicts">): void {
  const name = (id: Id) => ctx.store.get("entities", id)?.name ?? "someone";
  const what = (other: Entity | undefined, path: string) => (sheetFieldOf(other ? ctx.module.entityType(other.type) : undefined, path)?.label ?? path).toLowerCase();
  for (const edit of saved.edits) {
    const other = ctx.store.get("entities", edit.entityId);
    if (!other) continue;
    pushToast(edit.value === undefined ? `${other.name} no longer has ${self.name} as ${what(other, edit.path)}.` : `${other.name}'s ${what(other, edit.path)} is now ${self.name} too.`, { tone: "success" });
  }
  for (const c of saved.conflicts) {
    const other = ctx.store.get("entities", c.entityId);
    if (!other) continue;
    pushToast(`${other.name}'s ${what(other, c.path)} is still ${name(c.current)}.`, {
      tone: "info",
      action: {
        label: `Make it ${self.name}`,
        onClick: () => {
          const now = ctx.store.get("entities", c.entityId);
          if (!now) return;
          // through the same save, so the partner it had (Sefa) is let go too
          saveSheet(ctx, now.id, setPath(clone(now.fields), c.path, c.wanted), [c.path]);
        },
      },
    });
  }
}
