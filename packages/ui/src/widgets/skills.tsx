import { getPath } from "@campaign-forge/module-sdk";
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

/** Table of skills: attribute + skill = pool, with a roll button per row. */
export function SkillsField(props: WidgetProps) {
  const { value, onChange, readonly, fields, field } = props;
  const ctx = useSheetContext();
  const rows = skillRows(props, ctx.mode);
  const skills = isRecord(value) ? value : {};
  const attrPath = configString(field, "attributesPath", "attributes") as string;
  const min = configNumber(field, "min", 0);
  const max = configNumber(field, "max", typeof props.schema?.maximum === "number" ? props.schema.maximum : 5);
  const set = (id: string, n: number) => onChange({ ...skills, [id]: n });
  return (
    <table className="cf-skills">
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">Attribute</th>
          <th scope="col" className="cf-skills__num">
            Attr
          </th>
          <th scope="col" className="cf-skills__num">
            Skill
          </th>
          <th scope="col" className="cf-skills__num">
            Pool
          </th>
          {ctx.onRoll && <th scope="col" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const attrValue = r.attribute ? asNumber(getPath(fields, `${attrPath}.${r.attribute}`)) : 0;
          const skillValue = asNumber(skills[r.id]);
          const pool = attrValue + skillValue;
          return (
            <tr key={r.id} data-skill={r.id}>
              <th scope="row">{r.name}</th>
              <td className="cf-muted">{r.attribute ? humanize(r.attribute) : "—"}</td>
              <td className="cf-skills__num">{attrValue}</td>
              <td className="cf-skills__num">
                {readonly ? skillValue : <Stepper value={skillValue} min={min} max={max} onChange={(n) => set(r.id, n)} label={r.name} />}
              </td>
              <td className="cf-skills__num cf-skills__pool" data-testid={`pool-${r.id}`}>
                {pool}
              </td>
              {ctx.onRoll && (
                <td>
                  <Button size="sm" onClick={() => ctx.onRoll?.(r.id, { attribute: attrValue, skill: skillValue, skillId: r.id, attributeId: r.attribute })}>
                    Roll
                  </Button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
