import { backlinks, type Backlink, type Entity } from "@campaign-forge/core";
import { useMemo } from "react";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { Badge, EmptyState } from "../../components/ui";
import { useCampaign, useMapVersion } from "../../state/hooks";
import { openRecord } from "../shell/GlobalSearch";

export function BacklinksTab({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const links = useRecordLinks();
  const v = useMapVersion("*");
  const docs = useMapVersion("docs");
  const list = useMemo(
    () => backlinks(ctx.store, ctx.refIndex, entity.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.store, ctx.refIndex, entity.id, v, docs],
  );
  const open = (b: Backlink) => {
    if (b.kind === "timeline") return;
    openRecord(ctx, links, b.kind, b.id);
  };
  if (list.length === 0) return <EmptyState title="No backlinks yet" text="Scenes, notes, sessions and handouts that mention this entity appear here." />;
  return (
    <ul className="app-list" aria-label="Backlinks" data-testid="backlinks">
      {list.map((b) => (
        <li key={`${b.kind}:${b.id}:${b.via}`} className="app-list__row">
          <Badge>{b.kind}</Badge>
          {b.kind === "timeline" ? (
            <span>{b.title}</span>
          ) : (
            <button type="button" className="app-linkbtn" onClick={() => open(b)}>
              {b.title}
            </button>
          )}
          <span className="cf-muted">via {b.via === "body" ? "mention" : b.via}</span>
        </li>
      ))}
    </ul>
  );
}
