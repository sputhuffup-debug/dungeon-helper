/** Reference browser: reference lists, presets (add to campaign) and roll tables. */
import type { EntityPreset, ReferenceItem } from "@campaign-forge/module-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TableDialog } from "../../components/RulePanel";
import { Badge, Button, PageRef, Tabs, pushToast } from "../../components/ui";
import { humanize } from "../../lib/format";
import { createEntityFromPreset } from "../../state/actions";
import { useCampaign } from "../../state/hooks";
import { formatValue } from "../entities/NewEntityPage";

export function ReferencePage() {
  const ctx = useCampaign();
  return (
    <div className="app-page">
      <h1 className="app-title">Reference</h1>
      {ctx.module.manifest.dataStatus !== "verified" && <p className="app-note app-note--warning">Module data is {ctx.module.manifest.dataStatus}: unverified against the rulebook.</p>}
      <Tabs
        tabs={[
          { id: "lists", label: "Lists", content: <ListsTab /> },
          { id: "presets", label: `Presets (${ctx.module.module.presets.length})`, content: <PresetsTab /> },
          { id: "tables", label: `Tables (${ctx.module.module.tables.length})`, content: <TablesTab /> },
        ]}
      />
    </div>
  );
}

function ListsTab() {
  const ctx = useCampaign();
  const lists = ctx.module.module.referenceLists;
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [q, setQ] = useState("");
  const list = lists.find((l) => l.id === listId);
  const items = (list?.items ?? []).filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()) || (i.summary ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const i of list?.items ?? []) for (const k of Object.keys(i)) if (!["id", "name", "page", "mode", "summary"].includes(k)) keys.add(k);
    return [...keys].slice(0, 5);
  }, [list]);
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
        {list && <PageRef page={list.page} />}
        {list?.unverified && <Badge tone="warning">unverified</Badge>}
      </div>
      <div className="app-scroll-x">
        <table className="cf-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Summary</th>
              {columns.map((c) => (
                <th key={c}>{humanize(c)}</th>
              ))}
              <th>Page</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i: ReferenceItem) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
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
                  <PageRef page={i.page} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    (p) => (!type || p.entityType === type) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()) || (p.tags ?? []).some((t) => t.includes(q.trim().toLowerCase()))),
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
              <th>Page</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {presets.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong> {p.unverified && <Badge tone="warning">unverified</Badge>}
                </td>
                <td className="cf-muted">{ctx.module.entityType(p.entityType)?.name ?? p.entityType}</td>
                <td className="cf-muted">{p.summary ?? ""}</td>
                <td>
                  <PageRef page={p.page} />
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
                <PageRef page={t.page} />
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
