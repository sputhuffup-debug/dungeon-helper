import type { ReactNode } from "react";
import type { TrackerDef } from "@campaign-forge/module-sdk";
import { PageRef } from "../primitives/PageRef";
import { cx } from "../sheet/paths";

export interface TrackerFrameProps {
  def: TrackerDef;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Shared chrome: title, page ref, action slot. */
export function TrackerFrame({ def, actions, children, className }: TrackerFrameProps) {
  return (
    <section className={cx("cf-tracker", `cf-tracker--${def.kind}`, className)} aria-label={def.name} data-tracker={def.id}>
      <header className="cf-tracker__header">
        <h3 className="cf-tracker__title">
          {def.name} <PageRef page={def.page} cite={def.cite} />
        </h3>
        {actions && <div className="cf-toolbar__group">{actions}</div>}
      </header>
      <div className="cf-tracker__body">{children}</div>
    </section>
  );
}

export function TrackerLog({ entries }: { entries: Array<{ at?: string; text: string }> }) {
  if (entries.length === 0) return null;
  return (
    <ul className="cf-tracker__log" aria-label="Tracker log">
      {[...entries].reverse().map((e, i) => (
        <li key={i}>
          {e.at && <span className="cf-tracker__log-time">{e.at.slice(11, 16)}</span>}
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
