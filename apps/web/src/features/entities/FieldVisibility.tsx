/**
 * Field visibility: who sees each field of this entity (the GM, every
 * player, or chosen players), on top of the module's defaults. A field shared
 * with Sam only reaches Sam's packet. Fields the module shows a character's
 * own player are marked.
 */
import { fieldVisibilityOf, ownerMemberOf, playerMembers, type Entity, type Visibility } from "@campaign-forge/core";
import { ownerVisiblePaths, sheetFieldsForMode, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import { Badge, Button, Drawer } from "../../components/ui";
import { setFieldVisibility } from "../../state/actions";
import { useCampaign, useMeta } from "../../state/hooks";

interface FieldRow {
  path: string;
  label: string;
}

/** The sheet's fields for the play mode, one row per top-level field (a group such as attributes is one row). */
function fieldRows(def: EntityTypeDef, entity: Entity, mode: string): FieldRow[] {
  const sub = entity.subtype ? def.subtypes?.find((s) => s.id === entity.subtype) : undefined;
  const sections = sub?.sheet ? sub.sheet.sections : sheetFieldsForMode(def, mode);
  const out: FieldRow[] = [];
  const seen = new Set<string>();
  for (const s of sections) {
    for (const f of s.fields) {
      if (f.widget === "computed") continue;
      const root = f.path.split(".")[0]!;
      if (seen.has(root)) continue;
      seen.add(root);
      const grouped = s.fields.filter((x) => x.path.split(".")[0] === root).length > 1;
      out.push({ path: root, label: grouped ? s.title : (f.label ?? root) });
    }
  }
  return out;
}

const levelName: Record<Visibility["level"], string> = { gm: "GM only", players: "Players", revealed: "Revealed", some_players: "Some players" };

export function FieldVisibilityButton({ entity, def }: { entity: Entity; def: EntityTypeDef }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="field-visibility-open">
        Field visibility…
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Who sees ${entity.name}'s fields`}>
        {open && <FieldVisibilityList entity={entity} def={def} />}
      </Drawer>
    </>
  );
}

function FieldVisibilityList({ entity, def }: { entity: Entity; def: EntityTypeDef }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const players = playerMembers(meta);
  const owner = def.kind === "character" ? ownerMemberOf(meta, entity) : undefined;
  const rows = useMemo(() => fieldRows(def, entity, meta.mode), [def, entity, meta.mode]);
  const ownerPaths = ownerVisiblePaths(def, entity.subtype);
  return (
    <div className="app-stack" data-testid="field-visibility">
      <p className="cf-muted">
        Each field follows the module's default unless you set it here. “Some players” shares a field with the players you pick; it reaches their packets only.
        {owner ? ` ${owner.name} plays ${entity.name}: fields marked “${owner.name} sees it” always reach their packet.` : ""}
      </p>
      <ul className="app-list app-fieldvis">
        {rows.map((r) => {
          const override = entity.fieldVisibility?.[r.path];
          const effective = fieldVisibilityOf(entity, def, r.path);
          const ownerAll = ownerPaths.includes(r.path);
          const ownerPart = !ownerAll && ownerPaths.some((p) => p.startsWith(`${r.path}.`));
          return (
            <li key={r.path} className="app-list__row" data-field={r.path}>
              <span className="app-grow">
                {r.label}
                {!override && <span className="cf-muted"> · default {levelName[effective.level].toLowerCase()}</span>}
              </span>
              {owner && ownerAll && !override && <Badge tone="success">{owner.name} sees it</Badge>}
              {owner && ownerPart && !override && <Badge tone="success">{owner.name} sees part</Badge>}
              <VisibilitySelect label={`${r.label} visibility`} value={override ?? effective} players={players} onChange={(v) => setFieldVisibility(ctx, entity.id, r.path, v)} />
              {override && (
                <Button size="sm" variant="ghost" onClick={() => setFieldVisibility(ctx, entity.id, r.path, undefined)}>
                  Default
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
