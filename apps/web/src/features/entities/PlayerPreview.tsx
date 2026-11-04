/**
 * `/entities/$entityId?as=player`: the entity page as a player sees it. It
 * reads only the player projection (`viewerSheetOf`, the same view a player
 * packet gives a character), so GM-only fields, GM sections, tags, notes and
 * relationships stay out; a banner says so and offers the way back. Links to
 * other entities keep the preview.
 */
import { canSee, projectEntityForViewer, readableTags, relationshipLabel, viewerSheetOf, type Entity, type SheetValueContext, type Viewer } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { Badge, Card, EmptyState } from "../../components/ui";
import { useAssetUrl, useCampaign, useList, useMeta } from "../../state/hooks";

const PLAYER: Viewer = { role: "player" };

export function PlayerPreview({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const entities = useList("entities");
  const assets = useList("assets");
  const rels = useList("relationships");
  const module = ctx.module.module;
  const def = ctx.module.entityType(entity.type);
  const shown = useMemo(() => {
    const out = new Map<string, Entity>();
    for (const e of entities) {
      const p = projectEntityForViewer(e, ctx.module.entityType(e.type), PLAYER);
      if (p) out.set(p.id, p);
    }
    return out;
  }, [entities, ctx.module]);
  const projected = shown.get(entity.id);
  const sheet = useMemo(() => {
    const cx: SheetValueContext = { referenceName: (list, id) => ctx.module.referenceItem(list, id)?.name, entityName: (id) => shown.get(id)?.name, isEntity: (id) => !!ctx.store.get("entities", id) };
    return viewerSheetOf(entity, module, { meta, assets: Object.fromEntries(assets.map((a) => [a.id, a])) }, PLAYER, cx);
  }, [entity, module, meta, assets, shown, ctx]);
  const portrait = useAssetUrl(sheet?.portrait?.asset);
  const links = useMemo(
    () =>
      rels
        .filter((r) => canSee(r.visibility, PLAYER) && (r.from === entity.id || r.to === entity.id))
        .map((r) => {
          const out = r.from === entity.id;
          const other = shown.get(out ? r.to : r.from);
          return other ? { id: r.id, label: relationshipLabel(r, out ? "out" : "in", module), other } : undefined;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.label.localeCompare(b.label) || a.other.name.localeCompare(b.other.name)),
    [rels, entity.id, shown, module],
  );

  const banner = (
    <div className="app-preview-banner" role="status" data-testid="player-preview-banner">
      <span>
        <strong>Previewing as a player.</strong> {projected ? "This is what players see of this page: GM-only fields, sections, notes and links are left out." : "Players cannot see this entity at all."}
      </span>
      <span className="app-row">
        <Link to="/c/$campaignId/atlas" params={{ campaignId: ctx.campaignId }} search={{ as: "player" }} className="cf-btn cf-btn--sm cf-btn--ghost">
          Atlas preview
        </Link>
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: entity.id }} search={{}} className="cf-btn cf-btn--sm" data-testid="exit-player-preview">
          Exit preview
        </Link>
      </span>
    </div>
  );

  if (!projected || !sheet) {
    return (
      <div className="app-page app-entity" data-testid="entity-page" data-preview="player">
        {banner}
        <EmptyState title="Hidden from players" text={`${entity.name} is GM-only. Change its visibility to let players see it.`} />
      </div>
    );
  }

  // the GM's own tags only: players never see a generator's bookkeeping ("job-board")
  const tags = readableTags(projected.tags, ctx.module.module.machineTags);
  return (
    <div className="app-page app-entity" data-testid="entity-page" data-preview="player">
      {banner}
      <header className="app-entity__header app-entity__header--preview">
        <div className="app-entity__image">{portrait ? <img src={portrait} alt={projected.name} /> : <EntityIcon icon={def?.icon} kind={def?.kind} size={40} />}</div>
        <div className="app-entity__meta">
          <h1 className="app-title" data-testid="entity-title-preview">
            {projected.name}
          </h1>
          <div className="app-row">
            {sheet.kind && (
              <span className="app-entity__type">
                <EntityIcon icon={def?.icon} kind={def?.kind} size={14} /> {sheet.kind}
              </span>
            )}
            {tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {sheet.conditions.map((c) => (
              <Badge key={c} tone="warning">
                {c}
              </Badge>
            ))}
          </div>
          {projected.summary && <p className="cf-muted">{projected.summary}</p>}
        </div>
      </header>
      <div className="app-preview-sheet" data-testid="player-preview-sheet">
        {sheet.sections.length === 0 && <p className="cf-muted">Nothing on this sheet is shown to players.</p>}
        {sheet.sections.map((s) => (
          <Card key={s.title} title={s.title}>
            <dl className="app-dl">
              {s.rows.map((r) => (
                <div key={r.label} className="app-dl__row">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
        {links.length > 0 && (
          <Card title="Connections">
            <ul className="app-list">
              {links.map((l) => (
                <li key={l.id}>
                  <span className="cf-muted">{l.label}</span>{" "}
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: l.other.id }} search={{ as: "player" }} className="app-link-strong">
                    {l.other.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
