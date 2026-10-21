import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RollRecord } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";
import { Button } from "./Button";
import { PageRef } from "./PageRef";

export type ProvenanceKind = "rolled" | "preset" | "edited" | "computed";

export interface ProvenanceBadgeProps {
  kind: ProvenanceKind;
  /** Rolls behind a generated value, shown in the popover. */
  rolls?: RollRecord[];
  /** Extra detail line (e.g. preset name or the computed rule). */
  detail?: ReactNode;
  label?: string;
  onReroll?: () => void;
  className?: string;
}

const LABELS: Record<ProvenanceKind, string> = { rolled: "rolled", preset: "preset", edited: "edited", computed: "computed" };

/** A small provenance mark; clicking opens a popover listing the rolls behind the value. */
export function ProvenanceBadge({ kind, rolls, detail, label, onReroll, className }: ProvenanceBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cx("cf-prov", `cf-prov--${kind}`, className)}>
      <button type="button" className="cf-prov__btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {label ?? LABELS[kind]}
      </button>
      {open && (
        <div className="cf-pop" role="dialog" aria-label="Provenance">
          <div>
            <strong>{label ?? LABELS[kind]}</strong>
            {detail && <div className="cf-muted">{detail}</div>}
          </div>
          {rolls && rolls.length > 0 ? <RollRecordList rolls={rolls} /> : <div className="cf-muted">No rolls recorded.</div>}
          {onReroll && (
            <div style={{ marginTop: 8 }}>
              <Button size="sm" onClick={onReroll}>
                Re-roll
              </Button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export function RollRecordList({ rolls }: { rolls: RollRecord[] }) {
  return (
    <ul className="cf-prov__rolls">
      {rolls.map((r, i) => (
        <li key={`${r.step}-${r.iteration ?? 0}-${i}`} className="cf-prov__roll">
          <span className="cf-prov__roll-step">
            {r.step}
            {r.iteration !== undefined ? ` #${r.iteration + 1}` : ""}
          </span>
          <span>
            {r.rowLabel ?? String(typeof r.result === "string" ? r.result : "")} <PageRef page={r.page} cite={r.cite} />
          </span>
          <span className="cf-prov__roll-dice">
            {r.dice} → [{r.raw.join(", ")}]{r.modifier ? ` ${r.modifier > 0 ? "+" : ""}${r.modifier}` : ""} = {r.total}
          </span>
          <span className="cf-muted">{r.table ?? ""}</span>
          {r.nested && r.nested.length > 0 && (
            <div style={{ gridColumn: "1 / -1", paddingLeft: 12 }}>
              <RollRecordList rolls={r.nested} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
