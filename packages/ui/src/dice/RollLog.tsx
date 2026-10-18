import type { DiceSystem, RollRecord, RollResult } from "@campaign-forge/module-sdk";
import { RollRecordList } from "../primitives/ProvenanceBadge";
import { EmptyState } from "../primitives/Toolbar";
import { cx } from "../sheet/paths";
import { DieFace } from "./DieFace";
import { specById } from "./DiceRollPanel";

export interface RollLogEntry {
  id: string;
  /** ISO timestamp or any short time label. */
  at?: string;
  /** Who rolled / what for. */
  label: string;
  summary?: string;
  result?: RollResult;
  records?: RollRecord[];
}

export interface RollLogProps {
  entries: RollLogEntry[];
  dice?: DiceSystem;
  /** Newest first (default true). */
  newestFirst?: boolean;
  max?: number;
  className?: string;
}

function shortTime(at: string | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function RollLog({ entries, dice, newestFirst = true, max, className }: RollLogProps) {
  let list = newestFirst ? [...entries].reverse() : entries;
  if (max !== undefined) list = list.slice(0, max);
  if (list.length === 0) return <EmptyState title="No rolls yet" className={className} />;
  const baseId = dice?.dice[0]?.id;
  return (
    <ol className={cx("cf-rolllog", className)} aria-label="Roll log">
      {list.map((e) => (
        <li key={e.id} className="cf-rolllog__entry">
          <div className="cf-rolllog__head">
            <strong>{e.label}</strong>
            <span className="cf-rolllog__time">{shortTime(e.at)}</span>
          </div>
          {e.summary && <div className="cf-muted">{e.summary}</div>}
          {e.result && (
            <div className="cf-rolllog__faces cf-dice__faces">
              {e.result.dice.map((d, i) => (
                <DieFace key={i} spec={dice ? specById(dice, d.die) : undefined} value={d.value} kept={d.kept} special={baseId !== undefined && d.die !== baseId} />
              ))}
              <span className="cf-mono">
                {e.result.successes} ✓{dice ? ` · ${dice.describe(e.result)}` : ""}
              </span>
            </div>
          )}
          {e.records && e.records.length > 0 && <RollRecordList rolls={e.records} />}
        </li>
      ))}
    </ol>
  );
}
