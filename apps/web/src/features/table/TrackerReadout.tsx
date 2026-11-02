/**
 * The motion tracker readout: a sweep's blips drawn on range rings at their
 * bearing from the sweeper, with their letters (original art, SVG). It reads
 * the player projection of the hunt only (`PlayerTrackerState`): a letter,
 * a range band and a direction per blip, never a zone. The player screen and
 * the GM's hunt panel both use it.
 */
import type { PlayerSweep, PlayerTrackerState } from "@campaign-forge/core";
import type { RangeBandDef } from "@campaign-forge/module-sdk";
import { useId } from "react";

const BEARINGS: Record<string, number> = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: 225, S: 270, SE: 315 };
const SIZE = 220;
const C = SIZE / 2;
const R = 96;

/** The rings drawn: every band with a limit (the open-ended last band is the edge of the screen). */
function ringsOf(bands: RangeBandDef[] | undefined, sweep: PlayerSweep): Array<{ id: string; label: string }> {
  const fromModule = (bands ?? []).filter((b) => b.maxDistance !== undefined).map((b) => ({ id: b.id, label: b.label }));
  if (fromModule.length) return fromModule;
  const seen: Array<{ id: string; label: string }> = [];
  for (const b of sweep.blips) if (!seen.some((x) => x.id === b.band)) seen.push({ id: b.band, label: b.bandLabel });
  return seen;
}

/** Where a blip sits: its band's ring (the middle of it), at its bearing; blips sharing a spot fan out. */
function blipPoint(rings: Array<{ id: string }>, band: string, direction: string, index: number): [number, number] {
  const i = Math.max(0, rings.findIndex((r) => r.id === band));
  const n = Math.max(1, rings.length);
  const radius = direction === "here" ? R * 0.12 : (R * (i + 0.6)) / n;
  const deg = (BEARINGS[direction] ?? 90) + index * 14;
  const rad = (deg * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C - radius * Math.sin(rad)];
}

function SweepScreen({ sweep, bands }: { sweep: PlayerSweep; bands?: RangeBandDef[] | undefined }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rings = ringsOf(bands, sweep);
  const spots = new Map<string, number>();
  const placed = sweep.blips.map((b) => {
    const key = `${b.band}:${b.direction}`;
    const i = spots.get(key) ?? 0;
    spots.set(key, i + 1);
    return { b, p: blipPoint(rings, b.band, b.direction, i) };
  });
  return (
    <svg className="app-tracker__screen" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Tracker screen: ${sweep.blips.length ? sweep.blips.map((b) => `${b.letter} ${b.bandLabel} ${b.direction}`).join(", ") : "no movement"}`}>
      <defs>
        <radialGradient id={`${uid}-glass`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#0c2a1a" />
          <stop offset="100%" stopColor="#020a06" />
        </radialGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5dff9b" stopOpacity="0" />
          <stop offset="100%" stopColor="#5dff9b" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 8} fill={`url(#${uid}-glass)`} stroke="#1d3b2a" strokeWidth={4} />
      {/* the sweep wedge, pointing up the map */}
      <path d={`M${C},${C} L${C - R * 0.42},${C - R * 0.9} A${R},${R} 0 0 1 ${C + R * 0.42},${C - R * 0.9} Z`} fill={`url(#${uid}-sweep)`} />
      {rings.map((r, i) => {
        const rr = (R * (i + 1)) / rings.length;
        return (
          <g key={r.id} data-ring={r.id}>
            <circle cx={C} cy={C} r={rr} fill="none" stroke="#2f8a57" strokeWidth={1} strokeDasharray={i === rings.length - 1 ? undefined : "3 3"} />
            <text x={C + rr * 0.8 + 2} y={C + rr * 0.6 - 2} fontSize={7.5} fill="#5fbf86" fontFamily="ui-monospace, monospace" textAnchor="end">
              {r.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#1f5c3a" strokeWidth={0.8} />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#1f5c3a" strokeWidth={0.8} />
      {(["N", "E", "S", "W"] as const).map((d) => {
        const [x, y] = d === "N" ? [C, C - R - 1] : d === "S" ? [C, C + R + 9] : d === "E" ? [C + R + 5, C + 3] : [C - R - 5, C + 3];
        return (
          <text key={d} x={x} y={y} fontSize={8} textAnchor="middle" fill="#7ad99e" fontFamily="ui-monospace, monospace">
            {d}
          </text>
        );
      })}
      <circle cx={C} cy={C} r={3} fill="#5dff9b" />
      {placed.map(({ b, p: [x, y] }) => {
        // an arrow from the centre toward the blip
        const ang = Math.atan2(y - C, x - C);
        const len = Math.hypot(x - C, y - C);
        const tip: [number, number] = [C + Math.cos(ang) * Math.max(0, len - 12), C + Math.sin(ang) * Math.max(0, len - 12)];
        const head = (d: number) => `${tip[0] - 5 * Math.cos(ang + d)},${tip[1] - 5 * Math.sin(ang + d)}`;
        return (
          <g key={b.letter} data-blip={b.letter} data-band={b.band} data-direction={b.direction} className={b.seen ? "app-tracker__blip app-tracker__blip--seen" : "app-tracker__blip"}>
            {len > 16 && (
              <>
                <line x1={C + Math.cos(ang) * 6} y1={C + Math.sin(ang) * 6} x2={tip[0]} y2={tip[1]} stroke="#3fd27a" strokeWidth={1.2} strokeOpacity={0.55} />
                <polyline points={`${head(0.5)} ${tip[0]},${tip[1]} ${head(-0.5)}`} fill="none" stroke="#3fd27a" strokeWidth={1.2} strokeOpacity={0.8} />
              </>
            )}
            <circle cx={x} cy={y} r={11} fill={b.seen ? "none" : "#5dff9b"} fillOpacity={0.22} />
            <circle cx={x} cy={y} r={7.5} fill={b.seen ? "#0b1f14" : "#8dffbb"} stroke="#5dff9b" strokeWidth={b.seen ? 1.5 : 0} />
            <text x={x} y={y + 3.4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={b.seen ? "#8dffbb" : "#04140c"} fontFamily="ui-monospace, monospace">
              {b.letter}
            </text>
            {b.vertical && (
              <text x={x + 10} y={y + 3} fontSize={8} fill="#8dffbb" fontFamily="ui-monospace, monospace">
                {b.vertical === "above" ? "▲" : "▼"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function blipText(b: PlayerSweep["blips"][number]): string {
  const where = [b.bandLabel, b.direction === "here" ? "here" : b.direction, b.vertical].filter(Boolean).join(", ");
  return `${b.letter}: ${where}${b.seen ? " (seen)" : ""}`;
}

/** The readout for every sweep the players may see (this step's, else the last one, stale). */
export function TrackerReadout({ tracker, bands, title = "Motion tracker" }: { tracker: PlayerTrackerState | undefined; bands?: RangeBandDef[] | undefined; title?: string }) {
  if (!tracker || tracker.sweeps.length === 0) return null;
  return (
    <section className="app-tracker" aria-label={title} data-testid="tracker-readout">
      {tracker.sweeps.map((s, i) => (
        <article key={i} className={s.stale ? "app-tracker__sweep app-tracker__sweep--stale" : "app-tracker__sweep"} data-sweep-by={s.by}>
          <header className="app-tracker__head">
            <strong>{s.sensor}</strong>
            <span>
              {s.by}
              {s.stale ? " · last sweep" : ""}
            </span>
          </header>
          <SweepScreen sweep={s} bands={bands} />
          <ul className="app-tracker__blips" aria-label="Blips">
            {s.blips.length === 0 ? (
              <li className="app-tracker__none">No movement</li>
            ) : (
              s.blips.map((b) => (
                <li key={b.letter} data-testid="tracker-blip" data-letter={b.letter}>
                  {blipText(b)}
                </li>
              ))
            )}
          </ul>
        </article>
      ))}
    </section>
  );
}
