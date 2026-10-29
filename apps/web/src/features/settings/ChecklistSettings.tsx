/**
 * Settings: the campaign's session checklist. Hide or show the core and
 * module items, and add, edit or remove the GM's own items per phase. Stored
 * in `meta.settings.sessionChecklist`, so it travels with the campaign.
 */
import {
  CHECKLIST_PHASES,
  CHECKLIST_PHASE_TITLES,
  DEFAULT_SESSION_CHECKLIST,
  checklistSettings,
  moduleChecklistItems,
  newId,
  withChecklistSettings,
  type ChecklistPhase,
  type CustomChecklistItem,
  type SessionChecklistSettings,
} from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { AutoGrowText, Badge, Button, Card, IconButton, PageRef } from "../../components/ui";
import { updateMeta } from "../../state/actions";
import { useCampaign, useMeta } from "../../state/hooks";
import { useModuleShortName } from "../sessions/SessionChecklist";

export function ChecklistSettings() {
  const ctx = useCampaign();
  const meta = useMeta();
  const moduleName = useModuleShortName();
  const { hidden, custom } = checklistSettings(meta);
  const hiddenSet = new Set(hidden);
  const moduleItems = useMemo(
    () => moduleChecklistItems(ctx.module.module.templates, ctx.module.manifest.id).filter((i) => !i.mode || i.mode.includes(meta.mode)),
    [ctx.module, meta.mode],
  );
  const save = (next: SessionChecklistSettings) => updateMeta(ctx, { settings: withChecklistSettings(ctx.store.meta(), next) });
  const setShown = (id: string, shown: boolean) => save({ hidden: shown ? hidden.filter((h) => h !== id) : [...hidden, id] });
  const updateCustom = (id: string, patch: Partial<CustomChecklistItem>) =>
    save({
      custom: custom.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        if (!next.guidance) delete next.guidance;
        return next;
      }),
    });

  return (
    <Card title="Session checklist" subtitle="General guidance shown on every session. Hide what your table does not need and add your own items." data-testid="checklist-settings">
      <div className="app-stack">
        {CHECKLIST_PHASES.map((phase) => {
          const builtIn = [...DEFAULT_SESSION_CHECKLIST.filter((i) => i.phase === phase), ...moduleItems.filter((i) => i.phase === phase)];
          const own = custom.filter((c) => c.phase === phase);
          return (
            <section key={phase} className="app-stack app-checklist-settings__phase" aria-label={CHECKLIST_PHASE_TITLES[phase]} data-phase={phase}>
              <h4 className="app-table__group-title">{CHECKLIST_PHASE_TITLES[phase]}</h4>
              <ul className="app-list">
                {builtIn.map((item) => (
                  <li key={item.id} className="app-list__row" data-item={item.id}>
                    <label className="app-toggle app-grow">
                      <input type="checkbox" className="cf-checkbox" checked={!hiddenSet.has(item.id)} onChange={(e) => setShown(item.id, e.target.checked)} aria-label={`Show “${item.text}”`} />
                      <span className={hiddenSet.has(item.id) ? "cf-muted" : undefined}>{item.text}</span>
                    </label>
                    {item.source === "module" && <Badge tone="accent">{moduleName}</Badge>}
                    {item.page !== undefined && <PageRef page={item.page} />}
                  </li>
                ))}
                {own.map((c) => (
                  <li key={c.id} className="app-list__row app-checklist-settings__own" data-item={c.id}>
                    <AutoGrowText
                      className="cf-input app-grow"
                      aria-label="Item text"
                      defaultValue={c.text}
                      key={`t:${c.text}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.text) updateCustom(c.id, { text: v });
                        else if (!v) e.target.value = c.text;
                      }}
                    />
                    <AutoGrowText
                      className="cf-input app-grow"
                      aria-label="Item guidance"
                      placeholder="Guidance (optional)"
                      defaultValue={c.guidance ?? ""}
                      key={`g:${c.guidance ?? ""}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (c.guidance ?? "")) updateCustom(c.id, { guidance: v || undefined });
                      }}
                    />
                    <select className="cf-select" aria-label="Item phase" value={c.phase} onChange={(e) => updateCustom(c.id, { phase: e.target.value as ChecklistPhase })}>
                      {CHECKLIST_PHASES.map((p) => (
                        <option key={p} value={p}>
                          {CHECKLIST_PHASE_TITLES[p]}
                        </option>
                      ))}
                    </select>
                    <IconButton variant="ghost" label={`Remove “${c.text}”`} icon="×" onClick={() => save({ custom: custom.filter((x) => x.id !== c.id) })} />
                  </li>
                ))}
              </ul>
              <AddItem phase={phase} onAdd={(text, guidance) => save({ custom: [...custom, { id: `custom.${newId()}`, phase, text, ...(guidance ? { guidance } : {}) }] })} />
            </section>
          );
        })}
        {hidden.length > 0 && (
          <div className="app-row">
            <span className="cf-muted app-grow">
              {hidden.length} item{hidden.length === 1 ? "" : "s"} hidden.
            </span>
            <Button size="sm" variant="ghost" onClick={() => save({ hidden: [] })}>
              Show all
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function AddItem({ phase, onAdd }: { phase: ChecklistPhase; onAdd: (text: string, guidance: string) => void }) {
  const [text, setText] = useState("");
  const [guidance, setGuidance] = useState("");
  return (
    <form
      className="app-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim(), guidance.trim());
        setText("");
        setGuidance("");
      }}
    >
      <AutoGrowText className="cf-input app-grow" aria-label={`New item: ${CHECKLIST_PHASE_TITLES[phase]}`} placeholder="Add your own item…" value={text} onChange={(e) => setText(e.target.value)} />
      <AutoGrowText className="cf-input app-grow" aria-label={`New item guidance: ${CHECKLIST_PHASE_TITLES[phase]}`} placeholder="Guidance (optional)" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
      <Button type="submit" disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}
