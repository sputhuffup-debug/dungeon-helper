import { useState } from "react";
import { useSheetContext } from "../context";
import { Button } from "../primitives/Button";
import { PageRef } from "../primitives/PageRef";
import { Stepper } from "../primitives/Stepper";
import { asNumber, isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber, configString, referenceItems } from "./types";

export interface TalentEntry {
  id: string;
  count: number;
}

/** Normalise stored talents: ids, {id}, or {id,count}. */
export function normalizeTalents(value: unknown): TalentEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TalentEntry[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push({ id: v, count: 1 });
    else if (isRecord(v) && typeof v.id === "string") out.push({ id: v.id, count: Math.max(1, asNumber(v.count, 1)) });
  }
  return out;
}

/** Stacked talents from a reference list; each has a count stepper capped by the stack limit. */
export function TalentsField(props: WidgetProps) {
  const { value, onChange, readonly, field, referenceLists, id } = props;
  const { mode } = useSheetContext();
  const items = referenceItems(referenceLists, configString(field, "ref"), mode);
  const defaultLimit = configNumber(field, "maxStack", 1) as number;
  const talents = normalizeTalents(value);
  const [pick, setPick] = useState("");

  const limitFor = (talentId: string): number => {
    const item = items.find((i) => i.id === talentId);
    const own = item && typeof item.maxStack === "number" ? item.maxStack : undefined;
    return own ?? defaultLimit;
  };
  const commit = (next: TalentEntry[]) => onChange(next);
  const setCount = (talentId: string, n: number) => {
    const lim = limitFor(talentId);
    const c = Math.min(lim, Math.max(0, n));
    if (c === 0) commit(talents.filter((t) => t.id !== talentId));
    else commit(talents.map((t) => (t.id === talentId ? { ...t, count: c } : t)));
  };
  const add = () => {
    if (!pick) return;
    const existing = talents.find((t) => t.id === pick);
    if (existing) setCount(pick, existing.count + 1);
    else commit([...talents, { id: pick, count: 1 }]);
    setPick("");
  };

  return (
    <div className="cf-talents">
      {talents.length === 0 && <span className="cf-muted">No talents</span>}
      {talents.map((t) => {
        const item = items.find((i) => i.id === t.id);
        const lim = limitFor(t.id);
        return (
          <div key={t.id} className="cf-talents__row" data-talent={t.id}>
            <div>
              <span className="cf-talents__name">{item?.name ?? t.id}</span> <PageRef page={item?.page} cite={item?.cite} />
              {item?.summary && <span className="cf-talents__summary">{item.summary}</span>}
            </div>
            {readonly ? (
              <span className="cf-mono">×{t.count}</span>
            ) : (
              <Stepper value={t.count} min={0} max={lim} onChange={(n) => setCount(t.id, n)} label={`${item?.name ?? t.id} stacks`} editable={false} />
            )}
          </div>
        );
      })}
      {!readonly && items.length > 0 && (
        <div className="cf-talents__add">
          <select id={id} className="cf-select" aria-label="Add talent" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add talent…</option>
            {items.map((i) => {
              const have = talents.find((t) => t.id === i.id)?.count ?? 0;
              return (
                <option key={i.id} value={i.id} disabled={have >= limitFor(i.id)}>
                  {i.name}
                  {have > 0 ? ` (${have}/${limitFor(i.id)})` : ""}
                </option>
              );
            })}
          </select>
          <Button onClick={add} disabled={!pick}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
