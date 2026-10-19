/**
 * Builder field lists: a step names fields as `core.<field>` (the record's own
 * fields, rich-text bodies included) or as module narrative field paths
 * (rendered by the schema-driven sheet). Runs of module fields share one sheet.
 */
import { castMembers as membersOf, narrativeComputed, setNarrativeFields, type Id } from "@campaign-forge/core";
import { narrativeEntityType, validateEntityFields, type NarrativeKind, type ReferenceList } from "@campaign-forge/module-sdk";
import { useCallback, useMemo, type ReactNode } from "react";
import { SheetRenderer } from "../../../components/ui";
import { useCampaign, useMapVersion, useMeta } from "../../../state/hooks";

/** Split a field list into runs: each core field alone, consecutive module fields together. */
export function fieldRuns(fields: string[]): Array<{ core: string } | { paths: string[] }> {
  const out: Array<{ core: string } | { paths: string[] }> = [];
  for (const f of fields) {
    if (f.startsWith("core.")) {
      out.push({ core: f.slice(5) });
      continue;
    }
    const last = out[out.length - 1];
    if (last && "paths" in last) last.paths.push(f);
    else out.push({ paths: [f] });
  }
  return out;
}

export function useReferenceLists(): Record<string, ReferenceList> {
  const { module } = useCampaign();
  return useMemo(() => Object.fromEntries(module.module.referenceLists.map((l) => [l.id, l])), [module]);
}

/** The adventure's cast members by role, for widgets keyed by cast (`config.castRoles`, `config.keyedByCast`). */
export function useCastMembers(adventureId: Id): (role: string) => Array<{ id: string; name: string }> {
  const { store } = useCampaign();
  const entities = useMapVersion("entities");
  const adventures = useMapVersion("adventures");
  return useMemo(
    () => (role: string) => membersOf(store, adventureId, role).map((e) => ({ id: e.id, name: e.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, adventureId, entities, adventures],
  );
}

/** Module fields of an adventure, act or scene, edited through the sheet renderer. */
export function NarrativeSheet({ kind, id, adventureId, fields, paths }: { kind: NarrativeKind; id: Id; adventureId: Id; fields: Record<string, unknown> | undefined; paths: string[] }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const referenceLists = useReferenceLists();
  const nf = ctx.module.narrativeFieldsFor(kind, meta.mode);
  const def = useMemo(() => (nf ? narrativeEntityType(nf) : undefined), [nf]);
  const values = useMemo(() => fields ?? {}, [fields]);
  const computed = useMemo(() => narrativeComputed(ctx.module, kind, meta.mode, values), [ctx.module, kind, meta.mode, values]);
  const errors = useMemo(() => (def ? validateEntityFields(def, values).errors : []), [def, values]);
  const resolveEntityName = useCallback((eid: string) => ctx.store.get("entities", eid)?.name, [ctx.store]);
  const castMembers = useCastMembers(adventureId);
  if (!def) return null;
  return (
    <SheetRenderer
      def={def}
      mode={meta.mode}
      fields={values}
      computed={computed}
      errors={errors}
      paths={paths}
      referenceLists={referenceLists}
      resolveEntityName={resolveEntityName}
      castMembers={castMembers}
      onChange={(next) => setNarrativeFields(ctx.store, kind, id, next)}
      className="guided-sheet"
    />
  );
}

/** Render a field list: `renderCore` draws each core field, module fields go through the sheet. */
export function FieldList({ kind, id, adventureId, fields, values, renderCore }: { kind: NarrativeKind; id: Id; adventureId: Id; fields: string[]; values: Record<string, unknown> | undefined; renderCore: (field: string) => ReactNode }) {
  return (
    <>
      {fieldRuns(fields).map((run, i) => ("core" in run ? <div key={`core.${run.core}`}>{renderCore(run.core)}</div> : <NarrativeSheet key={`sheet.${i}`} kind={kind} id={id} adventureId={adventureId} fields={values} paths={run.paths} />))}
    </>
  );
}
