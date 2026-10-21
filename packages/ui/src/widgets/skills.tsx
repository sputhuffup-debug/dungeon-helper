import { getPath } from "@campaign-forge/module-sdk";
import { useState } from "react";
import { useSheetContext } from "../context";
import { Button } from "../primitives/Button";
import { Stepper } from "../primitives/Stepper";
import { asNumber, humanize, isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber, configString, referenceItems } from "./types";

interface SkillRow {
  id: string;
  name: string;
  attribute?: string;
}

function skillRows(props: WidgetProps, mode?: string): SkillRow[] {
  const cfg = props.field.config ?? {};
  if (Array.isArray(cfg.skills)) {
    return (cfg.skills as unknown[]).filter(isRecord).map((s) => ({ id: String(s.id), name: String(s.name ?? humanize(String(s.id))), attribute: typeof s.attribute === "string" ? s.attribute : undefined }));
  }
  const ref = typeof cfg.ref === "string" ? cfg.ref : undefined;
  const items = referenceItems(props.referenceLists, ref, mode);
  if (items.length > 0) return items.map((i) => ({ id: i.id, name: i.name, attribute: typeof i.attribute === "string" ? i.attribute : undefined }));
  // Fall back to the schema's declared properties, then to the value's keys.
  const props_ = isRecord(props.schema?.properties) ? Object.keys(props.schema.properties) : isRecord(props.value) ? Object.keys(props.value) : [];
  return props_.map((id) => ({ id, name: humanize(id) }));
}

/** `config.levels`: the ratings a skill can take, with labels (e.g. 0 "—", 1 "Proficient", 2 "Expertise"); shown as a select. */
function levelsOf(field: WidgetProps["field"]): Array<{ value: number; label: string }> | undefined {
  const raw = field.config?.levels;
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter(isRecord).map((l) => ({ value: asNumber(l.value), label: typeof l.label === "string" ? l.label : String(l.value) }));
  return out.length > 0 ? out : undefined;
}

/** `config.labels`: column headings (skill, attribute, attributeValue, value, pool). */
function headingsOf(field: WidgetProps["field"], totals: boolean) {
  const raw = isRecord(field.config?.labels) ? field.config.labels : {};
  const pick = (k: string, d: string) => (typeof raw[k] === "string" ? (raw[k] as string) : d);
  return { skill: pick("skill", "Skill"), attribute: pick("attribute", "Attribute"), attributeValue: pick("attributeValue", "Attr"), value: pick("value", "Skill"), pool: pick("pool", totals ? "Roll" : "Pool") };
}

/**
 * Table of skills: attribute + skill = pool, with a roll button per row.
 * `config.levels` turns the rating into a select of named levels;
 * `config.hideZero` lists only rated skills (with a toggle for the rest).
 */
export function SkillsField(props: WidgetProps) {
  const { value, onChange, readonly, fields, field } = props;
  const ctx = useSheetContext();
  const [showAll, setShowAll] = useState(false);
  const allRows = skillRows(props, ctx.mode);
  const skills = isRecord(value) ? value : {};
  const levels = levelsOf(field);
  const hideZero = field.config?.hideZero === true;
  const rows = hideZero && !showAll ? allRows.filter((r) => asNumber(skills[r.id]) !== 0) : allRows;
  const head = headingsOf(field, ctx.dice?.resultStyle === "total");
  const attrPath = configString(field, "attributesPath", "attributes") as string;
  const min = configNumber(field, "min", 0);
  const maxFor = (skillId: string): number | undefined => {
    const own = configNumber(field, "max");
    if (own !== undefined) return own;
    const propsSchema = isRecord(props.schema?.properties) ? props.schema.properties[skillId] : undefined;
    const sub = isRecord(propsSchema) ? propsSchema : isRecord(props.schema?.additionalProperties) ? props.schema.additionalProperties : undefined;
    return typeof sub?.maximum === "number" ? sub.maximum : 5;
  };
  const set = (id: string, n: number) => onChange({ ...skills, [id]: n });
  const { computed } = props;
  /** What the module's dice system gets for this row: the numbers, the ids, and the sheet for JSONLogic. */
  const rollInput = (r: SkillRow, attrValue: number, skillValue: number): Record<string, unknown> => ({
    attribute: attrValue,
    skill: skillValue,
    skillId: r.id,
    ...(r.attribute ? { attributeId: r.attribute } : {}),
    fields,
    computed,
  });
  /** A dice system that labels its pools (e.g. "1d20 + 5") shows that; pool systems keep attribute + skill. */
  const poolText = (input: Record<string, unknown>, fallback: number): string => {
    if (!ctx.dice) return String(fallback);
    try {
      return ctx.dice.buildPool(input).label ?? String(fallback);
    } catch {
      return String(fallback);
    }
  };
  const levelLabel = (n: number) => levels?.find((l) => l.value === n)?.label ?? String(n);
  return (
    <div className="cf-skills__wrap">
      <table className="cf-skills">
        <thead>
          <tr>
            <th scope="col">{head.skill}</th>
            <th scope="col">{head.attribute}</th>
            <th scope="col" className="cf-skills__num">
              {head.attributeValue}
            </th>
            <th scope="col" className="cf-skills__num">
              {head.value}
            </th>
            <th scope="col" className="cf-skills__num">
              {head.pool}
            </th>
            {ctx.onRoll && <th scope="col" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={ctx.onRoll ? 6 : 5} className="cf-muted">
                None
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const attrValue = r.attribute ? asNumber(getPath(fields, `${attrPath}.${r.attribute}`)) : 0;
            const skillValue = asNumber(skills[r.id]);
            const input = rollInput(r, attrValue, skillValue);
            const pool = poolText(input, attrValue + skillValue);
            return (
              <tr key={r.id} data-skill={r.id}>
                <th scope="row">{r.name}</th>
                <td className="cf-muted">{r.attribute ? humanize(r.attribute) : "—"}</td>
                <td className="cf-skills__num">{attrValue}</td>
                <td className="cf-skills__num">
                  {readonly ? (
                    levels ? levelLabel(skillValue) : skillValue
                  ) : levels ? (
                    <select className="cf-select cf-skills__level" aria-label={r.name} value={String(skillValue)} onChange={(e) => set(r.id, Number(e.target.value))}>
                      {!levels.some((l) => l.value === skillValue) && <option value={String(skillValue)}>{skillValue}</option>}
                      {levels.map((l) => (
                        <option key={l.value} value={String(l.value)}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Stepper value={skillValue} min={min} max={maxFor(r.id)} onChange={(n) => set(r.id, n)} label={r.name} />
                  )}
                </td>
                <td className="cf-skills__num cf-skills__pool" data-testid={`pool-${r.id}`}>
                  {pool}
                </td>
                {ctx.onRoll && (
                  <td>
                    <Button size="sm" onClick={() => ctx.onRoll?.(r.id, input, r.name)}>
                      Roll
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hideZero && !showAll && allRows.length > rows.length && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          Show all {allRows.length}
        </Button>
      )}
      {hideZero && showAll && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(false)}>
          Show rated only
        </Button>
      )}
    </div>
  );
}
