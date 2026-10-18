/** Dialog for choosing an entity: search, optional type filter, keyboard navigation. */
import type { Entity, Id } from "@campaign-forge/core";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useCampaign, useMapVersion } from "../state/hooks";
import { EntityIcon } from "./EntityIcon";
import { Dialog, EmptyState } from "./ui";

export interface EntityPickerProps {
  open: boolean;
  title?: string;
  /** Allowed entity type ids (all when omitted). */
  types?: string[];
  exclude?: Id[];
  onPick: (entity: Entity) => void;
  onClose: () => void;
}

export function EntityPicker({ open, title = "Choose an entity", types, exclude, onPick, onClose }: EntityPickerProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && <PickerBody types={types} exclude={exclude} onPick={onPick} />}
    </Dialog>
  );
}

function PickerBody({ types, exclude, onPick }: Pick<EntityPickerProps, "types" | "exclude" | "onPick">) {
  const { store, search, module } = useCampaign();
  const version = useMapVersion("entities");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const results = useMemo(() => {
    const skip = new Set(exclude ?? []);
    const allowed = types && types.length ? new Set(types) : undefined;
    let list: Entity[];
    if (query.trim()) {
      list = search
        .search(query, { kinds: ["entity"], types: allowed ? [...allowed] : undefined, limit: 40 })
        .map((h) => store.get("entities", h.id))
        .filter((e): e is Entity => !!e);
    } else {
      list = store
        .list("entities")
        .filter((e) => !allowed || allowed.has(e.type))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 60);
    }
    return list.filter((e) => !skip.has(e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, types, exclude, version, search, store]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[index];
      if (hit) onPick(hit);
    }
  };

  return (
    <div className="app-picker">
      <input
        className="cf-input"
        type="search"
        autoFocus
        placeholder="Search by name, tag or field"
        aria-label="Search entities"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKey}
      />
      {results.length === 0 ? (
        <EmptyState title="Nothing found" text="Create the entity first, then link it." />
      ) : (
        <ul className="app-picker__list" role="listbox" aria-label="Entities">
          {results.map((e, i) => {
            const def = module.entityType(e.type);
            return (
              <li key={e.id} role="option" aria-selected={i === index}>
                <button type="button" className={`app-picker__item${i === index ? " is-active" : ""}`} onClick={() => onPick(e)} onMouseEnter={() => setIndex(i)}>
                  <EntityIcon icon={def?.icon} kind={def?.kind} />
                  <span className="app-picker__name">{e.name}</span>
                  <span className="cf-muted">{def?.name ?? e.type}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
