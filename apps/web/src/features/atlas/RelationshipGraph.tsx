/**
 * A force-less relationship graph: entities as nodes in one column per kind,
 * relationships as lines. Hovering a node highlights its neighbourhood.
 */
import type { Entity, Id, Relationship } from "@campaign-forge/core";
import type { EntityTypeDef, GameModule } from "@campaign-forge/module-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/ui";
import { useCampaign, useList } from "../../state/hooks";

const COL_W = 220;
const ROW_H = 30;
const PAD = 24;
const MAX_NODES = 400;

const KIND_ORDER = ["location", "faction", "character", "creature", "job", "vehicle", "item", "clue", "encounter"];

export interface RelationshipGraphProps {
  entities: Entity[];
  typeById: Map<string, EntityTypeDef>;
  module: GameModule;
  label: (rel: Relationship, direction: "out" | "in", module?: GameModule) => string;
}

export function RelationshipGraph({ entities, typeById, module, label }: RelationshipGraphProps) {
  const { campaignId } = useCampaign();
  const navigate = useNavigate();
  const rels = useList("relationships");
  const [hover, setHover] = useState<Id | undefined>();

  const layout = useMemo(() => {
    const list = entities.slice(0, MAX_NODES);
    const byKind = new Map<string, Entity[]>();
    for (const e of list) {
      const k = typeById.get(e.type)?.kind ?? "other";
      byKind.set(k, [...(byKind.get(k) ?? []), e]);
    }
    const kinds = [...byKind.keys()].sort((a, b) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99));
    const pos = new Map<Id, { x: number; y: number }>();
    let maxRows = 0;
    kinds.forEach((k, ci) => {
      const col = (byKind.get(k) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      maxRows = Math.max(maxRows, col.length);
      col.forEach((e, ri) => pos.set(e.id, { x: PAD + ci * COL_W + 8, y: PAD + 28 + ri * ROW_H }));
    });
    const edges = rels.filter((r) => pos.has(r.from) && pos.has(r.to));
    return { kinds, byKind, pos, edges, width: PAD * 2 + Math.max(1, kinds.length) * COL_W, height: PAD * 2 + 28 + maxRows * ROW_H };
  }, [entities, typeById, rels]);

  if (entities.length === 0) return <EmptyState title="Nothing to draw" text="Entities and their relationships appear here." />;

  const neighbours = new Set<Id>();
  if (hover) {
    neighbours.add(hover);
    for (const r of layout.edges) {
      if (r.from === hover) neighbours.add(r.to);
      if (r.to === hover) neighbours.add(r.from);
    }
  }

  return (
    <div className="app-graph app-scroll-x">
      {entities.length > MAX_NODES && <p className="cf-muted">Showing the first {MAX_NODES} entities; use the filters to narrow the graph.</p>}
      <svg width={layout.width} height={layout.height} role="img" aria-label="Relationship graph" className="app-graph__svg">
        {layout.kinds.map((k, ci) => (
          <text key={k} x={PAD + ci * COL_W} y={PAD + 8} className="app-graph__kind">
            {(module.entityTypes.find((t) => t.kind === k)?.plural ?? k).toUpperCase()}
          </text>
        ))}
        {layout.edges.map((r) => {
          const a = layout.pos.get(r.from);
          const b = layout.pos.get(r.to);
          if (!a || !b) return null;
          const lit = hover !== undefined && (r.from === hover || r.to === hover);
          const dim = hover !== undefined && !lit;
          const mx = (a.x + b.x) / 2;
          const d = a.x === b.x ? `M${a.x},${a.y} C${a.x - 60},${a.y} ${b.x - 60},${b.y} ${b.x},${b.y}` : `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
          return (
            <path key={r.id} d={d} className={`app-graph__edge${lit ? " is-lit" : ""}${dim ? " is-dim" : ""}`}>
              <title>{`${label(r, "out", module)}`}</title>
            </path>
          );
        })}
        {[...layout.byKind.values()].flat().map((e) => {
          const p = layout.pos.get(e.id);
          if (!p) return null;
          const dim = hover !== undefined && !neighbours.has(e.id);
          return (
            <g
              key={e.id}
              transform={`translate(${p.x},${p.y})`}
              className={`app-graph__node${hover === e.id ? " is-hover" : ""}${dim ? " is-dim" : ""}`}
              onMouseEnter={() => setHover(e.id)}
              onMouseLeave={() => setHover(undefined)}
              onFocus={() => setHover(e.id)}
              onBlur={() => setHover(undefined)}
              onClick={() => void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId: e.id } })}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId: e.id } });
              }}
              tabIndex={0}
              role="link"
              aria-label={e.name}
            >
              <circle r={6} />
              <text x={12} y={4}>
                {e.name.length > 24 ? `${e.name.slice(0, 23)}…` : e.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
