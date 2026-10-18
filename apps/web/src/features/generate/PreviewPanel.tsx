/** What the run will create: entities (names editable before accept) and relationships. */
import type { GeneratedGraph } from "@campaign-forge/module-sdk";
import { EntityIcon } from "../../components/EntityIcon";
import { Badge, Card } from "../../components/ui";
import { humanize } from "../../lib/format";
import { useCampaign } from "../../state/hooks";
import { summaryLine } from "../entities/summary";
import { summarizeValue } from "./runner";

export function PreviewPanel({ graph, names, onRename }: { graph: GeneratedGraph; names: Record<string, string>; onRename: (tempId: string, name: string) => void }) {
  const { module } = useCampaign();
  const { entities, relationships } = graph.produced;
  const nameOf = (tempId: string) => names[tempId] ?? entities.find((e) => e.tempId === tempId)?.name ?? tempId;
  const relLabel = (type: string) => module.relationshipTypes.find((r) => r.id === type)?.forward ?? humanize(type);
  if (entities.length === 0) {
    return (
      <Card title="Preview">
        <p className="cf-muted">This procedure creates no entities. Its results (and any effects it suggests) are shown after you accept.</p>
      </Card>
    );
  }
  return (
    <Card title="Preview" subtitle={`${entities.length} entit${entities.length === 1 ? "y" : "ies"}, ${relationships.length} relationship${relationships.length === 1 ? "" : "s"}`}>
      <ul className="prep-preview" data-testid="preview">
        {entities.map((e) => {
          const def = module.entityType(e.type);
          const subtype = e.subtype ?? (typeof e.fields.subtype === "string" ? e.fields.subtype : undefined);
          const subName = subtype ? (def?.subtypes?.find((s) => s.id === subtype)?.name ?? humanize(subtype)) : undefined;
          const summary = summaryLine(def, e);
          const keyFields = Object.entries(e.fields)
            .filter(([k, v]) => k !== "subtype" && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0) && (typeof v !== "object" || Array.isArray(v)))
            .slice(0, 8);
          return (
            <li key={e.tempId} className="prep-preview__entity">
              <div className="app-row">
                <EntityIcon icon={def?.icon} kind={def?.kind} />
                <input
                  className="cf-input prep-preview__name"
                  aria-label={`Name of ${def?.name ?? e.type}`}
                  value={names[e.tempId] ?? e.name}
                  onChange={(ev) => onRename(e.tempId, ev.target.value)}
                  data-testid={`preview-name-${e.tempId}`}
                />
              </div>
              <div className="app-row">
                <Badge tone="accent">{def?.name ?? e.type}</Badge>
                {subName && <Badge>{subName}</Badge>}
                {e.within && <span className="cf-muted">within {nameOf(e.within)}</span>}
                {(e.tags ?? []).map((t) => (
                  <span key={t} className="cf-chip">
                    {t}
                  </span>
                ))}
              </div>
              {e.summary && <p className="prep-preview__summary">{e.summary}</p>}
              {summary && <p className="cf-muted">{summary}</p>}
              {keyFields.length > 0 && (
                <dl className="app-dl">
                  {keyFields.map(([k, v]) => (
                    <div key={k} className="app-dl__row">
                      <dt>{humanize(k)}</dt>
                      <dd>{summarizeValue(v, 140)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
      {relationships.length > 0 && (
        <>
          <h4 className="prep-h4">Relationships</h4>
          <ul className="app-list">
            {relationships.map((r, i) => (
              <li key={i} className="app-list__row">
                <strong>{nameOf(r.from)}</strong>
                <span className="cf-muted">{relLabel(r.type)}</span>
                <strong>{nameOf(r.to)}</strong>
                {r.note && <span className="cf-muted">({r.note})</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
