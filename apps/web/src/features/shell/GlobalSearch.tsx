/** Header search over the campaign, its module's rule cards and its Reference page (list items, presets, roll tables): grouped by kind, keyboard navigable, Enter opens. */
import type { Id, SearchHit, SearchKind } from "@campaign-forge/core";
import { referenceIndex, searchReference, searchRuleCards, titleMatchQuality, type ReferenceEntry, type RuleCard } from "@campaign-forge/module-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PageRef } from "../../components/ui";
import { EntityIcon } from "../../components/EntityIcon";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { useCampaign, useMapVersion, useMeta } from "../../state/hooks";

const KIND_LABEL: Record<SearchKind, string> = {
  entity: "Entities",
  note: "Notes",
  adventure: "Adventures",
  scene: "Scenes",
  handout: "Handouts",
  session: "Sessions",
};
const ORDER: SearchKind[] = ["entity", "note", "adventure", "scene", "handout", "session"];
const RULE_LIMIT = 6;
const REFERENCE_LIMIT = 8;

/** A campaign record, one of the module's rule cards (opened on the Rules page), or a Reference page entry (opened there). */
type Hit = SearchHit | { kind: "rule"; id: string; name: string; card: RuleCard } | { kind: "reference"; id: string; name: string; entry: ReferenceEntry };

type Group = { kind: SearchKind | "rule" | "reference"; label: string; hits: Hit[] };

/**
 * Rank the groups against each other by how well their names match: within
 * a group the best titles first (each kind's own order breaks ties), and the
 * group holding the best title first, so "panic" puts the Panic rule card,
 * not a creature whose notes mention panic, at the top, and Enter opens it.
 * The campaign's own records count one step better than the module's rules
 * and reference entries (and win a tie), so "lantern" lists the campaign's
 * Tipsy Lantern before a reference item called "Lantern Bearer"; an exact
 * rule or reference title ("Panic") still beats a record that only starts
 * with or holds the word ("Panic room").
 */
export function rankGroups(groups: Group[], query: string): Group[] {
  const quality = (h: Hit) => {
    // an exact title stands a step above the rest, so the boost below never lifts a near match over it
    const raw = titleMatchQuality(h.name, query);
    const q = raw === 6 ? 7 : raw;
    return q > 0 && h.kind !== "rule" && h.kind !== "reference" ? q + 1 : q;
  };
  const ranked = groups.map((g, order) => {
    const hits = g.hits.map((h, i) => ({ h, i, q: quality(h) })).sort((a, b) => b.q - a.q || a.i - b.i);
    return { group: { ...g, hits: hits.map((x) => x.h) }, best: hits[0]?.q ?? 0, order };
  });
  return ranked.sort((a, b) => b.best - a.best || a.order - b.order).map((r) => r.group);
}

/** What a Reference hit is, beside its name: its list, "Preset" with its type, or "Table". */
function referenceDetail(entry: ReferenceEntry, typeName: (id: string) => string | undefined): string {
  if (entry.kind === "item") return entry.list.name;
  if (entry.kind === "preset") return `Preset · ${typeName(entry.preset.entityType) ?? entry.preset.entityType}`;
  return "Table";
}

export function GlobalSearch() {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const links = useRecordLinks();
  const version = useMapVersion("*");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // the close that a blur schedules (so a click on a result lands first); focusing the box again cancels it
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const refIndex = useMemo(() => referenceIndex(ctx.module.module), [ctx.module]);
  const groups = useMemo(() => {
    const hits = ctx.search.search(query, { limit: 30 });
    const by = new Map<SearchKind, SearchHit[]>();
    for (const h of hits) by.set(h.kind, [...(by.get(h.kind) ?? []), h]);
    const out: Group[] = ORDER.filter((k) => by.has(k)).map((k) => ({ kind: k, label: KIND_LABEL[k], hits: by.get(k) ?? [] }));
    // the module's rule cards for this play mode, with their page references
    const rules = searchRuleCards(ctx.module.module.rules, query, { mode: meta.mode, limit: RULE_LIMIT });
    if (rules.length) out.push({ kind: "rule", label: "Rules", hits: rules.map((r) => ({ kind: "rule" as const, id: r.card.id, name: r.card.title, card: r.card })) });
    // what the Reference page lists: list items, presets and roll tables
    const refs = searchReference(refIndex, query, { mode: meta.mode, limit: REFERENCE_LIMIT });
    if (refs.length) out.push({ kind: "reference", label: "Reference", hits: refs.map((r) => ({ kind: "reference" as const, id: `${r.entry.kind}:${r.entry.kind === "item" ? `${r.entry.list.id}:` : ""}${r.entry.id}`, name: r.entry.name, entry: r.entry })) });
    return rankGroups(out, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.search, ctx.module, refIndex, meta.mode, query, version]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openHit = (hit: Hit) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (hit.kind === "rule") void navigate({ to: "/c/$campaignId/rules", params: { campaignId: ctx.campaignId }, search: { rule: hit.id } });
    else if (hit.kind === "reference") {
      const e = hit.entry;
      const search = e.kind === "item" ? { tab: "lists", list: e.list.id, item: e.id } : e.kind === "table" ? { tab: "tables", table: e.id } : { tab: "presets", preset: e.id };
      void navigate({ to: "/c/$campaignId/reference", params: { campaignId: ctx.campaignId }, search });
    } else openRecord(ctx, links, hit.kind, hit.id);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const hit = flat[index];
      if (hit) {
        e.preventDefault();
        openHit(hit);
      }
    } else if (e.key === "Escape") {
      // first Escape closes the results, the next clears the box; focus stays here either way
      e.preventDefault();
      if (open && query.trim() !== "") setOpen(false);
      else {
        setQuery("");
        setIndex(0);
      }
    }
  };

  let n = -1;
  return (
    <div className="app-search" role="search">
      <input
        ref={inputRef}
        className="cf-input app-search__input"
        type="search"
        placeholder="Search campaign  ( / )"
        aria-label="Search campaign"
        aria-expanded={open && query.trim() !== ""}
        aria-controls="app-search-results"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => {
            if (document.activeElement !== inputRef.current) setOpen(false);
          }, 150);
        }}
        onKeyDown={onKey}
      />
      {open && query.trim() !== "" && (
        <div className="app-search__results" id="app-search-results" role="listbox" aria-label="Search results">
          {flat.length === 0 && <div className="app-search__empty cf-muted">No matches</div>}
          {groups.map((g) => (
            <div key={g.kind} className="app-search__group" role="group" aria-labelledby={`app-search-group-${g.kind}`}>
              <div className="app-search__group-title" id={`app-search-group-${g.kind}`}>
                {g.label}
              </div>
              {g.hits.map((h) => {
                n += 1;
                const i = n;
                const def = h.kind === "entity" && h.type ? ctx.module.entityType(h.type) : undefined;
                const rule = h.kind === "rule" ? h.card : undefined;
                const ref = h.kind === "reference" ? h.entry : undefined;
                const refPage = ref ? (ref.kind === "item" ? { page: ref.item.page ?? ref.list.page, cite: ref.item.cite ?? ref.list.cite, original: ref.list.original } : ref.kind === "preset" ? { page: ref.preset.page, cite: ref.preset.cite, original: ref.preset.original } : { page: ref.table.page, cite: ref.table.cite, original: ref.table.original }) : undefined;
                return (
                  <button
                    key={`${h.kind}:${h.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    className={`app-search__hit${i === index ? " is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => openHit(h)}
                  >
                    {h.kind === "entity" ? <EntityIcon icon={def?.icon} kind={def?.kind} size={14} /> : <EntityIcon icon={rule || ref ? "book" : "note"} size={14} />}
                    <span className="app-search__name">{h.name}</span>
                    {def && <span className="cf-muted">{def.name}</span>}
                    {ref && <span className="cf-muted">{referenceDetail(ref, (id) => ctx.module.entityType(id)?.name)}</span>}
                    {rule && <PageRef page={rule.page} cite={rule.cite} original={rule.original} />}
                    {refPage && <PageRef page={refPage.page} cite={refPage.cite} original={refPage.original} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Open any searchable record in the place it is edited. */
export function openRecord(ctx: ReturnType<typeof useCampaign>, links: ReturnType<typeof useRecordLinks>, kind: SearchKind, id: Id): void {
  const { store } = ctx;
  switch (kind) {
    case "entity":
      links.openEntity(id);
      return;
    case "note":
      links.openNote(id);
      return;
    case "adventure":
      links.openAdventure(id);
      return;
    case "session":
      links.openSession(id);
      return;
    case "scene": {
      const scene = store.get("scenes", id);
      const act = scene?.act ? store.get("acts", scene.act) : undefined;
      if (act) links.openAdventure(act.adventure);
      return;
    }
    case "handout": {
      const h = store.get("handouts", id);
      const at = h?.attachedTo;
      if (!at) {
        // a character's own handout (e.g. a long-term agenda) opens the character
        if (h?.character) links.openEntity(h.character, h.purpose?.startsWith("long-agenda") ? "agenda" : undefined);
        return;
      }
      if (at.kind === "adventure") links.openAdventure(at.id);
      else if (at.kind === "act") {
        const act = store.get("acts", at.id);
        if (act) links.openAdventure(act.adventure);
      } else {
        const scene = store.get("scenes", at.id);
        const act = scene?.act ? store.get("acts", scene.act) : undefined;
        if (act) links.openAdventure(act.adventure);
      }
      return;
    }
  }
}
