/** Header search over the campaign: grouped by kind, keyboard navigable, Enter opens. */
import type { Id, SearchHit, SearchKind } from "@campaign-forge/core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { useCampaign, useMapVersion } from "../../state/hooks";

const KIND_LABEL: Record<SearchKind, string> = {
  entity: "Entities",
  note: "Notes",
  adventure: "Adventures",
  scene: "Scenes",
  handout: "Handouts",
  session: "Sessions",
};
const ORDER: SearchKind[] = ["entity", "note", "adventure", "scene", "handout", "session"];

export function GlobalSearch() {
  const ctx = useCampaign();
  const links = useRecordLinks();
  const version = useMapVersion("*");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const hits = ctx.search.search(query, { limit: 30 });
    const by = new Map<SearchKind, SearchHit[]>();
    for (const h of hits) by.set(h.kind, [...(by.get(h.kind) ?? []), h]);
    return ORDER.filter((k) => by.has(k)).map((k) => ({ kind: k, hits: by.get(k) ?? [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.search, query, version]);
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

  const openHit = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    openRecord(ctx, links, hit.kind, hit.id);
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
      setOpen(false);
      inputRef.current?.blur();
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
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && query.trim() !== "" && (
        <div className="app-search__results" id="app-search-results" role="listbox" aria-label="Search results">
          {flat.length === 0 && <div className="app-search__empty cf-muted">No matches</div>}
          {groups.map((g) => (
            <div key={g.kind} className="app-search__group">
              <div className="app-search__group-title">{KIND_LABEL[g.kind]}</div>
              {g.hits.map((h) => {
                n += 1;
                const i = n;
                const def = h.kind === "entity" && h.type ? ctx.module.entityType(h.type) : undefined;
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
                    {h.kind === "entity" ? <EntityIcon icon={def?.icon} kind={def?.kind} size={14} /> : <EntityIcon icon="note" size={14} />}
                    <span className="app-search__name">{h.name}</span>
                    {def && <span className="cf-muted">{def.name}</span>}
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
      if (!at) return;
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
