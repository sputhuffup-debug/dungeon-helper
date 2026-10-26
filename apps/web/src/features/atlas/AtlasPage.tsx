/**
 * Atlas: location tree, rosters per entity kind, and a relationship graph.
 * "Preview as player" runs every entity through `projectEntityForViewer`.
 */
import { locationTree, projectEntityForViewer, relationshipLabel, type Entity, type TreeNode, type Viewer } from "@campaign-forge/core";
import type { CoreEntityKind, EntityTypeDef } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { visibilityLabel, visibilityTone } from "../../components/VisibilitySelect";
import { Badge, EmptyState, Tabs } from "../../components/ui";
import { useCampaign, useList, useMapVersion } from "../../state/hooks";
import { summaryLine } from "../entities/summary";
import { RelationshipGraph } from "./RelationshipGraph";

const PLAYER: Viewer = { role: "player" };

interface Group {
  id: string;
  label: string;
  kind?: CoreEntityKind;
  pc?: boolean;
}

const KIND_GROUPS: Group[] = [
  { id: "factions", label: "Factions", kind: "faction" },
  { id: "npcs", label: "NPCs", kind: "character", pc: false },
  { id: "pcs", label: "PCs", kind: "character", pc: true },
  { id: "creatures", label: "Creatures", kind: "creature" },
  { id: "items", label: "Items", kind: "item" },
  { id: "vehicles", label: "Vehicles", kind: "vehicle" },
  { id: "jobs", label: "Jobs", kind: "job" },
  { id: "clues", label: "Clues", kind: "clue" },
  { id: "encounters", label: "Encounters", kind: "encounter" },
];

export function isPlayerCharacter(e: Entity): boolean {
  return e.fields.isPC === true || !!e.ownerMemberId;
}

export function AtlasPage() {
  const ctx = useCampaign();
  const search = useSearch({ from: "/c/$campaignId/atlas" });
  const navigate = useNavigate({ from: "/c/$campaignId/atlas" });
  const all = useList("entities");
  const relVersion = useMapVersion("relationships");
  const [asPlayer, setAsPlayer] = useState(false);
  const [tag, setTag] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [text, setText] = useState("");

  const types = ctx.module.module.entityTypes;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const kinds = new Set(types.map((t) => t.kind));
  const groups = KIND_GROUPS.filter((g) => g.kind && kinds.has(g.kind));
  const tab = search.tab ?? "locations";

  // player preview: drop what a player cannot see, strip hidden fields
  const visible = useMemo(() => {
    if (!asPlayer) return all;
    return all.map((e) => projectEntityForViewer(e, typeById.get(e.type), PLAYER)).filter((e): e is Entity => !!e);
  }, [all, asPlayer, typeById]);
  const visibleIds = useMemo(() => new Set(visible.map((e) => e.id)), [visible]);

  const allTags = useMemo(() => [...new Set(all.flatMap((e) => e.tags))].sort(), [all]);
  const matches = (e: Entity) =>
    (!tag || e.tags.includes(tag)) && (!typeFilter || e.type === typeFilter) && (!text.trim() || e.name.toLowerCase().includes(text.trim().toLowerCase()));

  const tree = useMemo(() => {
    const roots = locationTree(ctx.store, ctx.module.module);
    const prune = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter((n) => visibleIds.has(n.entity.id)).map((n) => ({ entity: visible.find((v) => v.id === n.entity.id) ?? n.entity, children: prune(n.children) }));
    return prune(roots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.store, ctx.module, all, relVersion, visibleIds, visible]);

  const groupEntities = (g: Group) =>
    visible.filter((e) => {
      const def = typeById.get(e.type);
      if (def?.kind !== g.kind) return false;
      if (g.pc !== undefined && isPlayerCharacter(e) !== g.pc) return false;
      return matches(e);
    });

  const tabs = [
    {
      id: "locations",
      label: "Locations",
      content: <LocationTree nodes={tree} matches={matches} typeById={typeById} />,
    },
    ...groups
      .filter((g) => g.id === "npcs" || g.id === "pcs" || g.id === "factions" || groupEntities(g).length > 0 || g.id === tab)
      .map((g) => ({
      id: g.id,
      label: `${g.label} (${groupEntities(g).length})`,
      content: <EntityTable entities={groupEntities(g)} typeById={typeById} kind={g.kind} pc={g.pc} />,
    })),
    {
      id: "graph",
      label: "Graph",
      content: <RelationshipGraph entities={visible.filter(matches)} typeById={typeById} module={ctx.module.module} label={relationshipLabel} />,
    },
  ];

  const typesForTab = (() => {
    const g = groups.find((x) => x.id === tab);
    if (g) return types.filter((t) => t.kind === g.kind);
    if (tab === "locations") return types.filter((t) => t.kind === "location");
    return types;
  })();

  return (
    <div className="app-page">
      <header className="app-page__header">
        <h1 className="app-title">Atlas</h1>
        <div className="app-row">
          <label className="app-toggle">
            <input type="checkbox" checked={asPlayer} onChange={(e) => setAsPlayer(e.target.checked)} data-testid="preview-as-player" />
            Preview as player
          </label>
          <Link to="/c/$campaignId/entities/new" params={{ campaignId: ctx.campaignId }} search={typesForTab.length === 1 && typesForTab[0] ? { type: typesForTab[0].id, ...(tab === "pcs" ? { pc: 1 as const } : {}) } : {}} className="cf-btn cf-btn--primary">
            + New
          </Link>
        </div>
      </header>
      {asPlayer && <p className="app-note">Showing only what a player could see: GM-only entities and fields are hidden.</p>}
      <div className="app-filters" role="group" aria-label="Filters">
        <input className="cf-input" type="search" placeholder="Filter by name" aria-label="Filter by name" value={text} onChange={(e) => setText(e.target.value)} />
        {typesForTab.length > 1 && (
          <select className="cf-select" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {typesForTab.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select className="cf-select" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <Tabs
        tabs={tabs}
        value={tabs.some((t) => t.id === tab) ? tab : "locations"}
        onChange={(id) => {
          setTypeFilter("");
          void navigate({ search: { tab: id }, replace: true });
        }}
      />
    </div>
  );
}

function LocationTree({ nodes, matches, typeById }: { nodes: TreeNode[]; matches: (e: Entity) => boolean; typeById: Map<string, EntityTypeDef> }) {
  // keep a node when it or a descendant matches the filters
  const keep = (n: TreeNode): boolean => matches(n.entity) || n.children.some(keep);
  const shown = nodes.filter(keep);
  if (shown.length === 0) return <EmptyState title="No locations" text="Add a location, or generate a star system, and nest places with “within” relationships." />;
  return (
    <ul className="app-tree" role="tree" aria-label="Locations">
      {shown.map((n) => (
        <TreeItem key={n.entity.id} node={n} keep={keep} typeById={typeById} />
      ))}
    </ul>
  );
}

function TreeItem({ node, keep, typeById }: { node: TreeNode; keep: (n: TreeNode) => boolean; typeById: Map<string, EntityTypeDef> }) {
  const { campaignId } = useCampaign();
  const [open, setOpen] = useState(true);
  const def = typeById.get(node.entity.type);
  const children = node.children.filter(keep);
  const subtype = node.entity.subtype ? def?.subtypes?.find((s) => s.id === node.entity.subtype)?.name ?? node.entity.subtype : undefined;
  return (
    <li role="treeitem" aria-expanded={children.length ? open : undefined} className="app-tree__item">
      <div className="app-tree__row">
        {children.length > 0 ? (
          <button type="button" className="app-tree__toggle" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen((o) => !o)}>
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="app-tree__toggle" />
        )}
        <EntityIcon icon={def?.icon} kind={def?.kind} size={14} />
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: node.entity.id }} className="app-link-strong">
          {node.entity.name}
        </Link>
        {subtype && <span className="cf-muted">{subtype}</span>}
      </div>
      {open && children.length > 0 && (
        <ul role="group">
          {children.map((c) => (
            <TreeItem key={c.entity.id} node={c} keep={keep} typeById={typeById} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EntityTable({ entities, typeById, kind, pc }: { entities: Entity[]; typeById: Map<string, EntityTypeDef>; kind?: CoreEntityKind; pc?: boolean }) {
  const { campaignId, module } = useCampaign();
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) {
    const def = module.module.entityTypes.find((t) => t.kind === kind);
    return (
      <EmptyState
        title="Nothing here yet"
        text={pc ? "Player characters are characters marked as PCs." : "Create one from a preset or from scratch."}
        action={
          def && (
            <Link to="/c/$campaignId/entities/new" params={{ campaignId }} search={{ type: def.id, ...(pc ? { pc: 1 as const } : {}) }} className="cf-btn">
              + {def.name}
            </Link>
          )
        }
      />
    );
  }
  return (
    <div className="app-scroll-x">
      <table className="cf-table app-entity-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Summary</th>
            <th>Tags</th>
            <th>Visibility</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const def = typeById.get(e.type);
            const subtype = e.subtype ? def?.subtypes?.find((s) => s.id === e.subtype)?.name ?? e.subtype : undefined;
            return (
              <tr key={e.id}>
                <td>
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: e.id }} className="app-link-strong">
                    {e.name}
                  </Link>
                </td>
                <td className="cf-muted">
                  {def?.name ?? e.type}
                  {subtype ? ` · ${subtype}` : ""}
                </td>
                <td className="cf-muted">{summaryLine(def, e)}</td>
                <td>
                  {e.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </td>
                <td>
                  <Badge tone={visibilityTone(e.visibility)}>{visibilityLabel(e.visibility)}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
