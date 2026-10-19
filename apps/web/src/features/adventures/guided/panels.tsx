/**
 * The guided builder's step panels: adventure fields, a cast role, an act
 * with its scenes, per-character agendas, and the review checklist. Each
 * panel edits the same records as the outline view.
 */
import { adventureActs, agendaFor, castMembers, moveInCast, newId, type Act, type Adventure, type AdventureStatus, type Entity, type Id, type Scene, type SceneStatus } from "@campaign-forge/core";
import { computeFields, reviewHeadline, type AdventureBuilderDef, type BuilderPanel, type CastRoleDef, type ReviewItemLevel, type ReviewResult } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { EntityPicker } from "../../../components/EntityPicker";
import { TagInput } from "../../../components/TagInput";
import { Badge, Button, Card, IconButton, PageRef, SheetRenderer } from "../../../components/ui";
import { RichTextEditor } from "../../../editor";
import { updateEntityFields } from "../../../state/actions";
import { addBuilderScene, dropCastMember, ensureCastAgendas, isMandatory, newCastMember, pickCastMember, setSceneMandatory } from "../../../state/builderActions";
import { deleteScene, ensureAdventureDocs, ensureDoc, moveScene, updateAdventure, updateScene } from "../../../state/prepActions";
import { useCampaign, useList, useMapVersion, useMeta } from "../../../state/hooks";
import { changedPaths } from "../../entities/SheetTab";
import { ADVENTURE_STATUSES } from "../AdventuresPage";
import { CommitInput, CommitTextarea } from "../fields";
import { FieldList, useReferenceLists } from "./NarrativeFields";

const CORE_LABELS: Record<string, string> = {
  title: "Title",
  premise: "Premise",
  status: "Status",
  playerIntro: "Player introduction",
  gmSituation: "The situation (GM only)",
  epilogue: "Epilogue",
  hooksIn: "Hooks in",
  hooksOut: "Hooks out",
  tags: "Tags",
  goal: "Goal",
  pacing: "Pacing notes",
  purpose: "Purpose",
  body: "Scene notes",
  readAloud: "Read-aloud text",
};

// ---------------------------------------------------------------------------
// adventure
// ---------------------------------------------------------------------------

export function AdventurePanel({ adventure, fields }: { adventure: Adventure; fields: string[] }) {
  const ctx = useCampaign();
  const set = (patch: Partial<Adventure>) => updateAdventure(ctx, adventure.id, patch);
  const docField = (field: "playerIntro" | "gmSituation" | "epilogue") => {
    const docId = adventure[`${field}Doc`];
    return (
      <div className="app-label">
        <span>{CORE_LABELS[field]}</span>
        {docId ? (
          <RichTextEditor docId={docId} label={CORE_LABELS[field]} />
        ) : (
          <Button size="sm" onClick={() => ensureAdventureDocs(ctx, adventure.id)}>
            Add {CORE_LABELS[field]?.toLowerCase()}
          </Button>
        )}
      </div>
    );
  };
  const renderCore = (field: string) => {
    switch (field) {
      case "title":
        return (
          <label className="app-label">
            <span>Title</span>
            <CommitInput value={adventure.title} label="Adventure title" onCommit={(v) => set({ title: v.trim() || adventure.title })} testId="guided-title" />
          </label>
        );
      case "premise":
        return (
          <label className="app-label">
            <span>Premise</span>
            <CommitTextarea value={adventure.premise ?? ""} label="Premise" placeholder="The premise in one paragraph" rows={3} onCommit={(v) => set({ premise: v.trim() || undefined })} />
          </label>
        );
      case "status":
        return (
          <label className="app-label">
            <span>Status</span>
            <select className="cf-select" aria-label="Adventure status" value={adventure.status} onChange={(e) => set({ status: e.target.value as AdventureStatus })}>
              {ADVENTURE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        );
      case "playerIntro":
      case "gmSituation":
      case "epilogue":
        return docField(field);
      case "hooksIn":
      case "hooksOut":
      case "tags":
        return (
          <div className="app-label">
            <span>{CORE_LABELS[field]}</span>
            <TagInput value={adventure[field]} onChange={(v) => set({ [field]: v })} label={CORE_LABELS[field]} />
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <Card title="Adventure" className="guided-panel" data-panel="adventure">
      <div className="app-stack">
        <FieldList kind="adventure" id={adventure.id} fields={fields} values={adventure.fields} renderCore={renderCore} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// cast
// ---------------------------------------------------------------------------

function roleHint(role: CastRoleDef, count: number): string | undefined {
  if (role.min !== undefined && role.max !== undefined) return `${count} of ${role.min === role.max ? role.min : `${role.min}–${role.max}`}`;
  if (role.min !== undefined) return `${count}, at least ${role.min}`;
  if (role.max !== undefined) return `${count}, at most ${role.max}`;
  return undefined;
}

export function CastPanel({ adventure, role }: { adventure: Adventure; role: CastRoleDef }) {
  const ctx = useCampaign();
  const entitiesVersion = useMapVersion("entities");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const members = useMemo(() => castMembers(ctx.store, adventure.id, role.id), [ctx.store, adventure, role.id, entitiesVersion]);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const def = ctx.module.entityType(role.entityType);
  const atMax = role.max !== undefined && members.length >= role.max;
  const hint = roleHint(role, members.length);
  const singular = def?.name ?? role.label;

  const create = () => {
    newCastMember(ctx, adventure.id, role, name);
    setName("");
  };

  return (
    <Card
      title={role.label}
      subtitle={hint ?? `${members.length} in the cast`}
      className="guided-panel"
      data-panel="cast"
      data-role={role.id}
      actions={
        <Button size="sm" onClick={() => setPicking(true)} disabled={atMax} aria-label={`Pick an existing ${singular.toLowerCase()} for ${role.label}`}>
          Pick existing
        </Button>
      }
    >
      {members.length === 0 && <p className="cf-muted">No {role.label.toLowerCase()} yet.</p>}
      <ul className="guided-cast">
        {members.map((e, i) => (
          <CastMemberCard key={e.id} adventureId={adventure.id} role={role} entity={e} index={i} count={members.length} />
        ))}
      </ul>
      <form
        className="app-row guided-cast__add"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!atMax) create();
        }}
      >
        <input className="cf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name of the new ${singular.toLowerCase()}`} aria-label={`New ${role.label} name`} />
        <Button type="submit" variant="primary" size="sm" disabled={atMax} data-testid={`cast-add-${role.id}`}>
          + New {singular.toLowerCase()}
        </Button>
      </form>
      <EntityPicker
        open={picking}
        title={`Add to ${role.label.toLowerCase()}`}
        types={[role.entityType]}
        exclude={members.map((m) => m.id)}
        onClose={() => setPicking(false)}
        onPick={(e: Entity) => {
          setPicking(false);
          pickCastMember(ctx, adventure.id, role.id, e.id);
        }}
      />
    </Card>
  );
}

function scalar(v: unknown): string | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : undefined;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return undefined;
}

function CastMemberCard({ adventureId, role, entity, index, count }: { adventureId: Id; role: CastRoleDef; entity: Entity; index: number; count: number }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const referenceLists = useReferenceLists();
  const def = ctx.module.entityType(entity.type);
  const computed = useMemo(() => {
    if (!def) return {};
    try {
      return computeFields(def, entity.fields);
    } catch {
      return {};
    }
  }, [def, entity.fields]);
  const paths = role.fields ?? def?.sheet.summary ?? [];
  // Computed values the entity's own sheet shows (e.g. Health), when the role's fields leave them out.
  const extraComputed = useMemo(() => {
    if (!def) return [];
    const shown = new Set(paths);
    const out: Array<{ path: string; label: string; value: string }> = [];
    for (const section of def.sheet.sections) {
      for (const f of section.fields) {
        if (f.widget !== "computed" || shown.has(f.path) || out.some((o) => o.path === f.path)) continue;
        const value = scalar(computed[f.path]);
        if (value !== undefined) out.push({ path: f.path, label: f.label ?? f.path, value });
      }
    }
    return out;
  }, [def, paths, computed]);
  const resolveEntityName = useCallback((id: string) => ctx.store.get("entities", id)?.name, [ctx.store]);
  const move = (delta: number) => moveInCast(ctx.store, adventureId, role.id, entity.id, delta);
  return (
    <li className="guided-cast__member" data-testid="cast-member" data-entity={entity.id}>
      <div className="app-row guided-cast__head">
        <CommitInput value={entity.name} label={`${role.label} ${index + 1} name`} className="cf-input guided-cast__name" onCommit={(v) => v.trim() && ctx.store.update("entities", entity.id, { name: v.trim() })} />
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: entity.id }} className="cf-btn cf-btn--sm cf-btn--ghost" aria-label={`Open ${entity.name}`}>
          Open
        </Link>
        <IconButton size="sm" variant="ghost" label={`Move ${entity.name} up`} icon="↑" disabled={index === 0} onClick={() => move(-1)} />
        <IconButton size="sm" variant="ghost" label={`Move ${entity.name} down`} icon="↓" disabled={index === count - 1} onClick={() => move(1)} />
        <IconButton size="sm" variant="ghost" label={`Remove ${entity.name} from ${role.label}`} icon="×" onClick={() => dropCastMember(ctx, adventureId, role.id, entity.id)} />
      </div>
      {extraComputed.length > 0 && (
        <p className="guided-cast__computed">
          {extraComputed.map((c) => (
            <span key={c.path} className="cf-chip" data-computed={c.path}>
              {c.label} <strong>{c.value}</strong>
            </span>
          ))}
        </p>
      )}
      {def && paths.length > 0 && (
        <SheetRenderer
          def={def}
          subtype={entity.subtype}
          mode={meta.mode}
          fields={entity.fields}
          computed={computed}
          paths={paths}
          referenceLists={referenceLists}
          resolveEntityName={resolveEntityName}
          onChange={(next) => updateEntityFields(ctx, entity.id, next, changedPaths(entity.fields, next))}
          className="guided-sheet"
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// act and its scenes
// ---------------------------------------------------------------------------

type ActPanelDef = Extract<BuilderPanel, { kind: "act" }>;

export function ActPanel({ adventure, panel }: { adventure: Adventure; panel: ActPanelDef }) {
  const ctx = useCampaign();
  const acts = useList("acts");
  const scenes = useList("scenes");
  const act = adventure.acts.map((id) => acts.find((a) => a.id === id)).find((a): a is Act => !!a && a.number === panel.act);
  if (!act) {
    return (
      <Card title={`Act ${panel.act}`} className="guided-panel" data-panel="act">
        <p className="cf-muted">This adventure has no act {panel.act}.</p>
        <Button size="sm" onClick={() => ctx.store.createAct(adventure.id, { number: panel.act, title: `Act ${panel.act}`, withPacingDoc: true })}>
          Add act {panel.act}
        </Button>
      </Card>
    );
  }
  const own = act.scenes.map((id) => scenes.find((s) => s.id === id)).filter((s): s is Scene => !!s);
  const mandatory = own.filter(isMandatory).length;
  const setAct = (patch: Partial<Act>) => ctx.store.update("acts", act.id, patch);
  const renderCore = (field: string) => {
    switch (field) {
      case "title":
        return (
          <label className="app-label">
            <span>Act title</span>
            <CommitInput value={act.title ?? ""} label={`Act ${act.number} title`} onCommit={(v) => setAct({ title: v.trim() || undefined })} />
          </label>
        );
      case "goal":
        return (
          <label className="app-label">
            <span>Goal</span>
            <CommitInput value={act.goal ?? ""} label={`Act ${act.number} goal`} placeholder="What this act must achieve" onCommit={(v) => setAct({ goal: v.trim() || undefined })} />
          </label>
        );
      case "pacing":
        return (
          <div className="app-label">
            <span>Pacing notes</span>
            {act.pacingDoc ? (
              <RichTextEditor docId={act.pacingDoc} label={`Act ${act.number} pacing notes`} />
            ) : (
              <Button size="sm" onClick={() => ensureDoc(ctx, "acts", act.id, "pacingDoc")}>
                Add pacing notes
              </Button>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <Card title={`Act ${act.number}${act.title ? `: ${act.title}` : ""}`} className="guided-panel" data-panel="act" data-act={act.number}>
      <div className="app-stack">
        <FieldList kind="act" id={act.id} fields={panel.fields} values={act.fields} renderCore={renderCore} />
        {panel.scenes && (
          <section className="guided-events" aria-label={`Act ${act.number} scenes`}>
            <header className="app-row">
              <h4 className="prep-h4 app-grow">Scenes</h4>
              <span className="cf-muted" data-testid={`act-${act.number}-counts`}>
                {own.length} scene{own.length === 1 ? "" : "s"} · {mandatory} mandatory
              </span>
            </header>
            <ol className="guided-events__list">
              {own.map((s, i) => (
                <SceneCard key={s.id} scene={s} act={act} index={i} count={own.length} sceneFields={panel.sceneFields ?? []} />
              ))}
            </ol>
            <Button size="sm" onClick={() => addBuilderScene(ctx, act.id)} aria-label={`Add a scene to act ${act.number}`}>
              + Scene
            </Button>
          </section>
        )}
      </div>
    </Card>
  );
}

const SCENE_STATUSES: SceneStatus[] = ["planned", "run", "skipped"];

function SceneCard({ scene, act, index, count, sceneFields }: { scene: Scene; act: Act; index: number; count: number; sceneFields: string[] }) {
  const ctx = useCampaign();
  const [confirm, setConfirm] = useState(false);
  const mandatory = isMandatory(scene);
  const set = (patch: Partial<Scene>) => updateScene(ctx, scene.id, patch);
  // Title and the mandatory flag live in the card header.
  const fields = sceneFields.filter((f) => f !== "core.title" && f !== "core.mandatory");
  const renderCore = (field: string) => {
    switch (field) {
      case "purpose":
        return (
          <label className="app-label">
            <span>Purpose</span>
            <CommitInput value={scene.purpose ?? ""} label={`${scene.title} purpose`} placeholder="What this scene is for" onCommit={(v) => set({ purpose: v.trim() || undefined })} />
          </label>
        );
      case "status":
        return (
          <label className="app-label">
            <span>Status</span>
            <select className="cf-select" aria-label={`${scene.title} status`} value={scene.status} onChange={(e) => set({ status: e.target.value as SceneStatus })}>
              {SCENE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        );
      case "body":
        return (
          <div className="app-label">
            <span>{CORE_LABELS.body}</span>
            <RichTextEditor docId={scene.bodyDoc} label={`${scene.title} notes`} />
          </div>
        );
      case "readAloud":
        return (
          <div className="app-label">
            <span>{CORE_LABELS.readAloud}</span>
            {scene.readAloudDoc ? (
              <RichTextEditor docId={scene.readAloudDoc} label={`${scene.title} read-aloud text`} />
            ) : (
              <Button size="sm" onClick={() => ensureDoc(ctx, "scenes", scene.id, "readAloudDoc")}>
                Add read-aloud text
              </Button>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <li className={`guided-event${mandatory ? " is-mandatory" : ""}`} data-testid="scene-card" data-scene={scene.id}>
      <div className="app-row guided-event__head">
        <span className="guided-event__n" aria-hidden="true">
          {index + 1}
        </span>
        <CommitInput value={scene.title} label={`Act ${act.number} scene ${index + 1} title`} className="cf-input guided-event__title" onCommit={(v) => set({ title: v.trim() || scene.title })} />
        <label className="app-toggle">
          <input type="checkbox" checked={mandatory} onChange={(e) => setSceneMandatory(ctx, scene.id, e.target.checked)} aria-label={`${scene.title} is mandatory`} />
          Mandatory
        </label>
        <Badge tone={mandatory ? "warning" : "muted"}>{mandatory ? "mandatory" : "optional"}</Badge>
        <Link
          to="/c/$campaignId/adventures/$adventureId"
          params={{ campaignId: ctx.campaignId, adventureId: act.adventure }}
          search={{ view: "outline", node: `scene:${scene.id}` }}
          className="cf-btn cf-btn--sm cf-btn--ghost"
          aria-label={`Open ${scene.title} in the outline`}
        >
          Open
        </Link>
        <IconButton size="sm" variant="ghost" label={`Move ${scene.title} up`} icon="↑" disabled={index === 0} onClick={() => moveScene(ctx, scene.id, -1)} />
        <IconButton size="sm" variant="ghost" label={`Move ${scene.title} down`} icon="↓" disabled={index === count - 1} onClick={() => moveScene(ctx, scene.id, 1)} />
        <IconButton size="sm" variant="ghost" label={`Delete ${scene.title}`} icon="×" onClick={() => setConfirm(true)} />
      </div>
      {fields.length > 0 && (
        <div className="app-stack guided-event__body">
          <FieldList kind="scene" id={scene.id} fields={fields} values={scene.fields} renderCore={renderCore} />
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Delete ${scene.title}?`}
        danger
        confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          deleteScene(ctx, scene.id);
        }}
      >
        <p>The scene and its handouts are removed.</p>
      </ConfirmDialog>
    </li>
  );
}

// ---------------------------------------------------------------------------
// agendas
// ---------------------------------------------------------------------------

export function AgendasPanel({ adventure, role }: { adventure: Adventure; role: CastRoleDef }) {
  const ctx = useCampaign();
  const entitiesVersion = useMapVersion("entities");
  const actsVersion = useMapVersion("acts");
  const handoutsVersion = useMapVersion("handouts");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const members = useMemo(() => castMembers(ctx.store, adventure.id, role.id), [ctx.store, adventure, role.id, entitiesVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const acts = useMemo(() => adventureActs(ctx.store, adventure), [ctx.store, adventure, actsVersion]);

  // One agenda handout per member per act: reuse existing ones, create the missing.
  useEffect(() => {
    const missing = members.filter((m) => acts.some((a) => !agendaFor(ctx.store, a, m.id)));
    if (missing.length) ensureCastAgendas(ctx, adventure.id, missing.map((m) => m.id));
  }, [ctx, adventure.id, members, acts, handoutsVersion]);

  return (
    <Card title={`${role.label}: agendas`} subtitle="One agenda per act for each character, revealed only to that player." className="guided-panel" data-panel="agendas">
      {members.length === 0 && <p className="cf-muted">Add {role.label.toLowerCase()} first; each gets one agenda per act.</p>}
      <div className="guided-agendas">
        {members.map((m) => (
          <section key={m.id} className="guided-agendas__member" aria-label={`${m.name} agendas`}>
            <h4 className="prep-h4">{m.name}</h4>
            {acts.map((a) => {
              const h = agendaFor(ctx.store, a, m.id);
              return (
                <div key={a.id} className="app-label guided-agendas__act">
                  <span>
                    Act {a.number}
                    {a.title ? `: ${a.title}` : ""}
                  </span>
                  {h?.bodyDoc ? (
                    <RichTextEditor docId={h.bodyDoc} label={`${m.name}, act ${a.number} agenda`} placeholder="A concrete private goal for this act" />
                  ) : h ? (
                    <Button size="sm" onClick={() => ctx.store.update("handouts", h.id, { bodyDoc: newId() })}>
                      Add agenda text
                    </Button>
                  ) : (
                    <span className="cf-muted">Creating…</span>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// review
// ---------------------------------------------------------------------------

export const LEVEL_ICONS: Record<ReviewItemLevel, string> = { bad: "✕", warn: "!", ok: "✓" };
const LEVEL_NAMES: Record<ReviewItemLevel, string> = { bad: "Fix", warn: "Warning", ok: "Passed" };

export function reviewSummaryLine(result: ReviewResult): string {
  const w = result.summary.warn;
  return `${reviewHeadline(result)} · ${w} warning${w === 1 ? "" : "s"}`;
}

export function ReviewPanel({ result, builder, onJump }: { result: ReviewResult | undefined; builder: AdventureBuilderDef; onJump: (stepId: string) => void }) {
  const stepTitle = (id: string) => builder.steps.find((s) => s.id === id)?.title ?? id;
  return (
    <Card title="Review" subtitle="Advice, never a gate: you can save and leave at any time." className="guided-panel app-checklist" data-panel="review" data-testid="review-panel">
      {!result ? (
        <p className="cf-muted">Checking…</p>
      ) : (
        <>
          <p className={`guided-review__summary${result.summary.bad ? " is-bad" : " is-ready"}`} data-testid="review-summary">
            {reviewSummaryLine(result)}
          </p>
          {result.items.length === 0 && <p className="cf-muted">This builder has no review checks.</p>}
          <ul className="guided-review" aria-label="Review checklist">
            {result.items.map((item, i) => (
              <li key={`${item.ruleId}-${i}`} className={`guided-review__item is-${item.level}`} data-level={item.level} data-rule={item.ruleId}>
                <button type="button" className="guided-review__jump" onClick={() => onJump(item.step)} title={`Go to ${stepTitle(item.step)}`}>
                  <span className="guided-review__icon" aria-hidden="true">
                    {LEVEL_ICONS[item.level]}
                  </span>
                  <span className="cf-sr-only">{LEVEL_NAMES[item.level]}:</span>
                  <span className="guided-review__message">{item.message}</span>
                  <span className="guided-review__step">{stepTitle(item.step)}</span>
                </button>
                {item.page !== undefined && <PageRef page={item.page} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
