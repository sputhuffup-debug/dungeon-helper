/** Reference browser: reference lists, presets (add to campaign) and roll tables. */
import { supplementOf, type EntityPreset, type ReferenceItem, type ReferenceList } from "@campaign-forge/module-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TableDialog } from "../../components/RulePanel";
import { Badge, Button, Dialog, Markdown, PageRef, SourceBadge, Tabs, pushToast } from "../../components/ui";
import { humanize } from "../../lib/format";
import { createEntityFromPreset } from "../../state/actions";
import { useCampaign } from "../../state/hooks";
import { formatValue } from "../entities/NewEntityPage";
import { ModuleAttribution } from "../modules/ModuleLicense";

export function ReferencePage() {
  const ctx = useCampaign();
  return (
    <div className="app-page">
      <h1 className="app-title">Reference</h1>
      {ctx.module.manifest.dataStatus !== "verified" && (
        <p className="app-note app-note--warning">
          Module data is {ctx.module.manifest.dataStatus === "partially-verified" ? "partially verified" : "unverified"} against {ctx.module.manifest.sourceBook?.title ?? "the rulebook"}.
        </p>
      )}
      <Tabs
        tabs={[
          { id: "lists", label: "Lists", content: <ListsTab /> },
          { id: "presets", label: `Presets (${ctx.module.module.presets.length})`, content: <PresetsTab /> },
          { id: "tables", label: `Tables (${ctx.module.module.tables.length})`, content: <TablesTab /> },
        ]}
      />
      <ModuleAttribution license={ctx.module.manifest.license} />
    </div>
  );
}

const ITEM_META = new Set(["id", "name", "page", "cite", "mode", "summary", "source", "edition"]);

/** Columns of a reference list: its own `columns`, else the first five data keys. */
export function listColumns(list: ReferenceList | undefined): string[] {
  if (!list) return [];
  if (list.columns && list.columns.length > 0) return list.columns;
  const keys = new Set<string>();
  for (const i of list.items) for (const k of Object.keys(i)) if (!ITEM_META.has(k)) keys.add(k);
  return [...keys].slice(0, 5);
}

/** Text an item matches a filter on: its name, summary, edition and source badges, and the shown columns. */
function itemText(item: ReferenceItem, columns: string[]): string {
  return [item.name, item.summary ?? "", item.edition ?? "", item.source ?? "", ...columns.map((c) => formatValue(item[c]))].join(" ").toLowerCase();
}

function ListsTab() {
  const ctx = useCampaign();
  const lists = ctx.module.module.referenceLists;
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ReferenceItem | undefined>();
  const list = lists.find((l) => l.id === listId);
  const columns = useMemo(() => listColumns(list), [list]);
  const needle = q.trim().toLowerCase();
  const items = (list?.items ?? []).filter((i) => !needle || itemText(i, columns).includes(needle));
  return (
    <div className="app-stack">
      <div className="app-filters">
        <select className="cf-select" aria-label="Reference list" value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.items.length})
            </option>
          ))}
        </select>
        <input className="cf-input" type="search" placeholder="Filter" aria-label="Filter items" value={q} onChange={(e) => setQ(e.target.value)} />
        {list && <PageRef page={list.page} cite={list.cite} original={list.original} />}
        {list?.unverified && <Badge tone="warning">unverified</Badge>}
      </div>
      <div className="app-scroll-x">
        <table className="cf-table" data-testid="reference-items">
          <thead>
            <tr>
              <th>Name</th>
              <th>Summary</th>
              {columns.map((c) => (
                <th key={c}>{humanize(c)}</th>
              ))}
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i: ReferenceItem) => (
              <tr key={i.id}>
                <td>
                  <button type="button" className="app-linkbtn" onClick={() => setOpen(i)}>
                    <strong>{i.name}</strong>
                  </button>
                  <SourceBadge source={i.source} edition={i.edition} />
                  {i.mode?.map((m) => (
                    <Badge key={m} tone="accent">
                      {m}
                    </Badge>
                  ))}
                </td>
                <td className="cf-muted">{i.summary ?? ""}</td>
                {columns.map((c) => (
                  <td key={c}>{formatValue(i[c])}</td>
                ))}
                <td>
                  <PageRef page={i.page} cite={i.cite} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!open} onClose={() => setOpen(undefined)} title={open?.name}>
        {open && list && <ReferenceItemView item={open} list={list} />}
      </Dialog>
    </div>
  );
}

/** Every field of a reference item; long text renders as Markdown (spell and item descriptions, class tables). */
export function ReferenceItemView({ item, list }: { item: ReferenceItem; list: ReferenceList }) {
  const rows = Object.entries(item).filter(([k, v]) => !ITEM_META.has(k) && v !== undefined && v !== null && v !== "");
  const isLong = (v: unknown) => typeof v === "string" && (v.length > 90 || v.includes("\n") || v.trim().startsWith("|"));
  return (
    <div className="app-stack app-refitem" data-testid="reference-item">
      {(item.source || item.edition) && (
        <p className="app-row">
          <SourceBadge source={item.source} edition={item.edition} />
        </p>
      )}
      {item.summary && <p className="cf-muted">{item.summary}</p>}
      <dl className="app-dl">
        {rows
          .filter(([, v]) => !isLong(v))
          .map(([k, v]) => (
            <div key={k} className="app-dl__row">
              <dt>{humanize(k)}</dt>
              <dd>{typeof v === "boolean" ? (v ? "Yes" : "No") : formatValue(v)}</dd>
            </div>
          ))}
      </dl>
      {rows
        .filter(([, v]) => isLong(v))
        .map(([k, v]) => (
          <section key={k}>
            {k !== "description" && <h4 className="app-subtitle">{humanize(k)}</h4>}
            <Markdown text={String(v)} />
          </section>
        ))}
      <p>
        <PageRef page={item.page ?? list.page} cite={item.cite ?? list.cite} original={list.original} />
      </p>
    </div>
  );
}

function PresetsTab() {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const types = ctx.module.module.entityTypes.filter((t) => ctx.module.presetsFor(t.id).length > 0);
  const presets = ctx.module.module.presets.filter(
    (p) =>
      (!type || p.entityType === type) &&
      (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()) || (p.summary ?? "").toLowerCase().includes(q.trim().toLowerCase()) || (p.tags ?? []).some((t) => t.includes(q.trim().toLowerCase()))),
  );
  const add = (p: EntityPreset) => {
    const e = createEntityFromPreset(ctx, p);
    pushToast(`Added ${e.name}`, { tone: "success" });
    void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: ctx.campaignId, entityId: e.id } });
  };
  return (
    <div className="app-stack">
      <div className="app-filters">
        <select className="cf-select" aria-label="Entity type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plural}
            </option>
          ))}
        </select>
        <input className="cf-input" type="search" placeholder="Filter presets" aria-label="Filter presets" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="app-scroll-x">
        <table className="cf-table">
          <thead>
            <tr>
              <th>Preset</th>
              <th>Type</th>
              <th>Summary</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {presets.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong> <SourceBadge source={supplementOf(ctx.module.manifest, p.id)?.name} /> {p.unverified && <Badge tone="warning">unverified</Badge>}
                </td>
                <td className="cf-muted">{ctx.module.entityType(p.entityType)?.name ?? p.entityType}</td>
                <td className="cf-muted">{p.summary ?? ""}</td>
                <td>
                  <PageRef page={p.page} cite={p.cite} original={p.original} />
                </td>
                <td>
                  <Button size="sm" onClick={() => add(p)}>
                    Add to campaign
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TablesTab() {
  const ctx = useCampaign();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | undefined>();
  const groups = useMemo(() => {
    const by = new Map<string, typeof ctx.module.module.tables>();
    for (const t of ctx.module.module.tables) {
      if (q.trim() && !t.name.toLowerCase().includes(q.trim().toLowerCase())) continue;
      const fam = t.family ?? "Other";
      by.set(fam, [...(by.get(fam) ?? []), t]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [ctx.module, q]);
  return (
    <div className="app-stack">
      <input className="cf-input" type="search" placeholder="Filter tables" aria-label="Filter tables" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map(([fam, tables]) => (
        <section key={fam}>
          <h3 className="app-subtitle">{humanize(fam)}</h3>
          <ul className="app-list">
            {tables.map((t) => (
              <li key={t.id} className="app-list__row">
                <button type="button" className="app-linkbtn" onClick={() => setOpen(t.id)}>
                  {t.name}
                </button>
                <Badge>{t.dice}</Badge>
                <SourceBadge source={supplementOf(ctx.module.manifest, t.id)?.name} />
                <PageRef page={t.page} cite={t.cite} original={t.original} />
                {t.unverified && <Badge tone="warning">unverified</Badge>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <TableDialog tableId={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}
