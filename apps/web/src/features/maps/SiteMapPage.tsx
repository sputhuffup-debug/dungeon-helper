/**
 * The map page for a generated site map (a SiteMap with a `layout`): GM,
 * player and tracking views with the legend, downloads (SVG, PNG at 150 dpi,
 * A4/Letter print tiles, a vector PDF for 24" and 36" wide-format rolls),
 * the generator's checks, the zone key and the distance table.
 * Image maps keep the rectangle editor (MapPage).
 */
import { distanceTable, exitText, isDuctSheet, markGroup, zoneKeyRows, zoneNumbers, type SiteMap, type ZoneKeyMark, type ZoneKeyRow } from "@campaign-forge/core";
import type { MapCheck } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import {
  Badge,
  Button,
  Card,
  MapLegend,
  PageRef,
  ROLL_WIDTHS,
  SiteMapView,
  Tabs,
  defaultGridSquares,
  defaultMmPerMetre,
  drawSiteMap,
  printScalesFor,
  squareName,
  pushToast,
  type PaperSize,
  type SiteMapViewKind,
} from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { RegenerateMapLink } from "../mapgen/RegenerateMapLink";
import { updateSiteMap } from "../../state/prepActions";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import { deckIn, layoutForView, maxActOf, rollPlan, useMapGenerator, useMapPalette } from "./siteMapFiles";
import "./sitemap.css";

type Downloads = typeof import("./siteMapDownloads");

/** Run a download with the exporters, which load on first use; a failure (a chunk that cannot load included) shows a toast. */
function download(what: string, fn: (d: Downloads) => unknown): void {
  import("./siteMapDownloads")
    .then(fn)
    .catch((e: unknown) => pushToast(`${what} failed: ${errorMessage(e)}`, { tone: "danger" }));
}

const VIEWS: Array<{ id: SiteMapViewKind; label: string; note: string }> = [
  { id: "gm", label: "GM map", note: "Everything: zone numbers, spawns, clues, NPCs, hazards, locks and act shading." },
  { id: "player", label: "Player map", note: "What the crew can see, printed whole. At the table the player screen adds fog. Duct sheets join it once the players have crawled into one, fogged where they have not been." },
  { id: "tracking", label: "Tracking map", note: "Zone outlines, numbers and ducts, large enough to move hidden tokens on. One page per deck." },
];

/** The same views for a map the players explore room by room (unseen rooms are left out, not fogged). */
const ROOM_VIEWS: Array<{ id: SiteMapViewKind; label: string; note: string }> = [
  { id: "gm", label: "GM map", note: "Everything: room numbers, encounters, traps, treasure, locked and secret doors (dashed)." },
  { id: "player", label: "Player map", note: "The plan the players may see, printed whole without its secret rooms and doors or any GM mark. At the table the player screen shows only the rooms you reveal." },
  { id: "tracking", label: "Tracking map", note: "Room outlines and numbers, large enough to move hidden tokens on. One page per level." },
];

export function SiteMapPage({ record, onDelete, scenesCard }: { record: SiteMap; onDelete: () => void; scenesCard: React.ReactNode }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const def = useMapGenerator(record);
  const palette = useMapPalette();
  const layout = record.layout!;
  const location = useRecord("entities", record.location);
  const [view, setView] = useState<SiteMapViewKind>("gm");
  const [deckChoice, setDeck] = useState<string | undefined>(layout.decks[0]?.id);
  const [selected, setSelected] = useState<string | undefined>();
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [exportTitle, setExportTitle] = useState(false);
  const [roll, setRoll] = useState<number>(36);
  const [mmPerMetre, setMmPerMetre] = useState(() => defaultMmPerMetre(layout));
  const scales = useMemo(() => printScalesFor(layout), [layout]);
  // a map in squares prints its tiles at a choice of scales; a metric map at 1 m = 1 cm
  const tileScales = useMemo(() => (layout.gridUnit ? scales.filter((s) => s.id !== "true-28mm").reverse() : undefined), [layout, scales]);
  const [tileMm, setTileMm] = useState<number | undefined>(() => tileScales?.[0]?.mmPerMetre);
  const views = layout.fog === "hide" ? ROOM_VIEWS : VIEWS;
  // grid squares follow the view and scale until the GM ticks or unticks them
  const [gridChoice, setGridChoice] = useState<boolean | undefined>();
  const [rollTitle, setRollTitle] = useState(true);
  const shown = useMemo(() => layoutForView(layout, view, def, record.live), [layout, view, def, record.live]);
  // the player print has no duct sheet the players have not been in: fall back to the first deck
  const deck = deckIn(shown, deckChoice);
  const sheets = layout.decks.filter(isDuctSheet).length;
  const legend = def?.legend ?? [];
  const numbers = useMemo(() => zoneNumbers(layout), [layout]);
  const playable = numbers.size;
  const failing = layout.checks.filter((c) => !c.ok);
  const fileOpts = { view, deck, def, titleBlock: exportTitle };
  const gridSquares = gridChoice ?? defaultGridSquares(view, mmPerMetre);
  const rollOpts = useMemo(() => ({ view, deck, def, rollWidthIn: roll, mmPerMetre, gridSquares, titleBlock: rollTitle }), [view, deck, def, roll, mmPerMetre, gridSquares, rollTitle]);
  const plan = useMemo(() => rollPlan(record, rollOpts), [record, rollOpts]);
  // marker texts that did not fit in their zones: the map shows a letter, this line the text
  const callouts = useMemo(() => drawSiteMap(shown, { view, deck, legend, passable: def?.passable }).callouts, [shown, view, deck, legend, def]);

  const selectedRow = useMemo(() => (selected ? zoneKeyRows(record, ctx.module.module).find((r) => r.id === selected) : undefined), [record, selected, ctx.module]);

  const body = (
    <>
        <p className="cf-muted prep-sitemap__note">{views.find((v) => v.id === view)?.note}</p>

        <div className="prep-sitemap__layout">
          <div className="prep-sitemap__main">
            <SiteMapView
              key={view}
              layout={shown}
              view={view}
              legend={legend}
              palette={palette}
              deck={deck}
              onDeckChange={setDeck}
              title={record.name}
              selected={selected ? [selected] : undefined}
              onSelectZone={view === "player" ? undefined : (z) => setSelected((s) => (s === z ? undefined : z))}
              onFollowLink={(z) => setSelected(z)}
              passable={def?.passable}
              className="prep-sitemap__map"
            />
            {callouts.length > 0 && (
              <p className="cf-muted prep-sitemap__notes" data-testid="map-notes">
                <span>Map notes</span>
                {callouts.map((c) => (
                  <span key={c.ref} data-callout-note={c.ref}>
                    <strong>{c.ref}</strong> {c.label}
                    {c.number !== undefined ? `, ${layout.numbering === "key" ? "room" : "zone"} ${c.number}` : ""}
                  </span>
                ))}
              </p>
            )}
            <div className="app-row prep-sitemap__downloads" role="group" aria-label="Map downloads">
              <Button size="sm" onClick={() => download("SVG export", (d) => d.downloadMapSvg(record, fileOpts))} data-testid="download-svg">
                SVG
              </Button>
              <Button size="sm" onClick={() => download("PNG export", (d) => d.downloadMapPng(record, fileOpts))} data-testid="download-png">
                PNG (150 dpi)
              </Button>
              <label className="app-row">
                <input type="checkbox" className="cf-checkbox" checked={exportTitle} onChange={(e) => setExportTitle(e.target.checked)} data-testid="export-title-block" />
                Title block
              </label>
              {tileScales ? (
                <select className="cf-select" aria-label="Tile scale" value={String(tileMm)} onChange={(e) => setTileMm(Number(e.target.value))} data-testid="tile-scale">
                  {tileScales.map((s) => (
                    <option key={s.id} value={String(s.mmPerMetre)}>
                      Print tiles at {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="cf-muted">Print tiles at 1 m = 1 cm</span>
              )}
              <select className="cf-select" aria-label="Paper size" value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
              <Button
                size="sm"
                onClick={() =>
                  download("Print tiles", (d) => {
                    const r = d.printMapTiles(record, { ...fileOpts, paper, mmPerMetre: tileMm });
                    pushToast(r.opened ? `${r.pages} page${r.pages === 1 ? "" : "s"} ready to print` : `Saved ${r.pages} page${r.pages === 1 ? "" : "s"} as a printable file`, { tone: "success" });
                  })
                }
                data-testid="print-tiles"
              >
                Print tiles
              </Button>
            </div>
            <fieldset className="prep-sitemap__roll" data-testid="roll-print">
              <legend>Print on a roll</legend>
              <div className="app-row prep-sitemap__downloads">
                <select className="cf-select" aria-label="Roll width" value={roll} onChange={(e) => setRoll(Number(e.target.value))} data-testid="roll-width">
                  {ROLL_WIDTHS.map((w) => (
                    <option key={w} value={w}>
                      {w}" roll
                    </option>
                  ))}
                </select>
                <select
                  className="cf-select"
                  aria-label="Print scale"
                  value={String(mmPerMetre)}
                  onChange={(e) => {
                    setMmPerMetre(Number(e.target.value));
                    setGridChoice(undefined);
                  }}
                  data-testid="roll-scale"
                >
                  {scales.map((s) => (
                    <option key={s.id} value={String(s.mmPerMetre)}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label className="app-row">
                  <input type="checkbox" className="cf-checkbox" checked={gridSquares} onChange={(e) => setGridChoice(e.target.checked)} data-testid="roll-grid" />
                  {squareName(layout)} grid squares
                </label>
                <label className="app-row">
                  <input type="checkbox" className="cf-checkbox" checked={rollTitle} onChange={(e) => setRollTitle(e.target.checked)} data-testid="roll-title-block" />
                  Title block
                </label>
                <span className="cf-muted" data-testid="roll-summary" title={plan ? `Map ${plan.mapWidthIn}" × ${plan.mapHeightIn}"${plan.rotated ? ", turned 90°" : ""}${plan.strips > 1 ? `, ${plan.strips} strips of ${plan.stripWidthIn}" with ${plan.overlapIn}" overlap` : ""}` : undefined}>
                  {plan ? `${views.find((v) => v.id === view)?.label} · ${plan.summary}${plan.rotated ? " · turned 90°" : ""}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    download("PDF export", (d) => {
                      const p = d.downloadRollPdf(record, rollOpts);
                      if (p) pushToast(`PDF ready: ${p.summary}`, { tone: "success" });
                    })
                  }
                  data-testid="download-roll-pdf"
                >
                  Download PDF
                </Button>
              </div>
            </fieldset>
          </div>
          <aside className="prep-sitemap__side">
            {selectedRow && view !== "player" && (
              <Card title={`${selectedRow.number ?? ""} ${selectedRow.name}`.trim()} subtitle={layout.cover === false ? selectedRow.kind : `${selectedRow.cover} · ${selectedRow.kind}`} data-testid="zone-detail">
                <ZoneRowDetail row={selectedRow} />
              </Card>
            )}
            {legend.length > 0 && (
              <Card title="Legend">
                <MapLegend legend={legend} view={view} palette={palette} renderPage={(p) => <PageRef page={p} />} />
              </Card>
            )}
            <ChecksCard checks={layout.checks} />
          </aside>
        </div>
    </>
  );

  return (
    <div className="app-page prep-mappage prep-sitemap" data-testid="map-page" data-layout="generated">
      <header className="app-page__header">
        <div className="app-stack prep-mappage__meta">
          <input
            className="app-entity__name"
            aria-label="Map name"
            defaultValue={record.name}
            key={record.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== record.name) updateSiteMap(ctx, record.id, { name: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            data-testid="map-name"
          />
          <div className="app-row">
            {location && (
              <>
                <span className="cf-muted">Location</span>
                <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: location.id }} className="app-link-strong">
                  {location.name}
                </Link>
              </>
            )}
            <VisibilitySelect value={record.visibility} onChange={(v) => updateSiteMap(ctx, record.id, { visibility: v })} hasPlayers={meta.members.some((m) => m.role === "player")} />
            <Badge>{playable} zones</Badge>
            <Badge>
              {layout.decks.length - sheets} deck{layout.decks.length - sheets === 1 ? "" : "s"}
            </Badge>
            {sheets > 0 && (
              <Badge>
                {sheets} duct sheet{sheets === 1 ? "" : "s"}
              </Badge>
            )}
            {def && <Badge title={record.generator ? `Seed ${record.generator.seed}` : undefined}>{def.name}</Badge>}
            {failing.some((c) => c.level === "block") && <Badge tone="danger">blocking checks fail</Badge>}
          </div>
        </div>
        <div className="app-row">
          <RegenerateMapLink map={record} />
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </header>

      <Tabs
        value={view}
        onChange={(v) => {
          setView(v as SiteMapViewKind);
          setSelected(undefined);
          setGridChoice(undefined);
        }}
        className="prep-sitemap__tabs"
        tabs={views.map((v) => ({ id: v.id, label: v.label, content: body }))}
      />

      <ZoneKeyCard
        record={record}
        onSelect={(id) => {
          setSelected(id);
          // a duct zone's row opens its duct sheet
          const z = layout.zones.find((x) => x.id === id);
          if (z) setDeck(z.deck);
        }}
      />
      <DistanceCard record={record} maxAct={layout.acts === false ? 1 : maxActOf(layout)} />
      <div className="app-grid">{scenesCard}</div>
    </div>
  );
}

/** One exit of a zone key row: "3 Larder (door)", or a duct sheet's "To Galley (Z14) (access)". */
function ExitLine({ e }: { e: ZoneKeyRow["exits"][number] }) {
  return (
    <div data-exit-label={e.label ? "1" : undefined}>
      {e.label ?? `${e.number ?? ""} ${e.name}`} <span className="cf-muted">({[e.kind, ...e.notes].join(", ")})</span>
    </div>
  );
}

/** A GM mark of the key: its text, linked to the entity it was accepted as. */
function MarkLine({ m }: { m: ZoneKeyMark }) {
  const ctx = useCampaign();
  const label = m.entity ? (
    <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: m.entity }} className="app-link-strong">
      {m.label}
    </Link>
  ) : (
    <strong>{m.label}</strong>
  );
  return (
    <div data-mark={m.kind}>
      {label}
      {m.detail ? `: ${m.detail}` : ""}
    </div>
  );
}

function ZoneRowDetail({ row }: { row: ZoneKeyRow }) {
  const groups = (["encounters", "traps", "treasure"] as const).map((g) => [g, row.marks.filter((m) => markGroup(m.kind) === g)] as const).filter(([, ms]) => ms.length > 0);
  return (
    <dl className="prep-sitemap__dl">
      {row.readAloud && (
        <>
          <dt>Read aloud</dt>
          <dd className="prep-sitemap__readaloud">{row.readAloud}</dd>
        </>
      )}
      {groups.map(([g, ms]) => (
        <span key={g} style={{ display: "contents" }}>
          <dt>{g === "encounters" ? "Encounters" : g === "traps" ? "Traps" : "Treasure"}</dt>
          <dd>
            {ms.map((m) => (
              <MarkLine key={m.id} m={m} />
            ))}
          </dd>
        </span>
      ))}
      {row.layer === "duct" && (
        <>
          <dt>Sheet</dt>
          <dd>{row.deckName}</dd>
        </>
      )}
      {row.flags.length > 0 && (
        <>
          <dt>Flags</dt>
          <dd>{row.flags.join(", ")}</dd>
        </>
      )}
      <dt>Exits</dt>
      <dd>{row.exits.length === 0 ? "none" : row.exits.map((e, i) => <ExitLine key={i} e={e} />)}</dd>
      {row.details.length > 0 && (
        <>
          <dt>Details</dt>
          <dd>{row.details.join("; ")}</dd>
        </>
      )}
      {row.salvage.length > 0 && (
        <>
          <dt>Salvage</dt>
          <dd>{row.salvage.join("; ")}</dd>
        </>
      )}
      {row.clues.length > 0 && (
        <>
          <dt>Clues</dt>
          <dd>{row.clues.join("; ")}</dd>
        </>
      )}
      {row.gmNote && (
        <>
          <dt>GM note</dt>
          <dd>{row.gmNote}</dd>
        </>
      )}
    </dl>
  );
}

function ChecksCard({ checks }: { checks: MapCheck[] }) {
  if (checks.length === 0) return null;
  const order = (c: MapCheck) => (c.ok ? 2 : c.level === "block" ? 0 : 1);
  const sorted = [...checks].sort((a, b) => order(a) - order(b));
  const blocks = checks.filter((c) => !c.ok && c.level === "block").length;
  const warns = checks.filter((c) => !c.ok && c.level === "warn").length;
  return (
    <Card title="Checks" subtitle={blocks || warns ? `${blocks} blocking · ${warns} warning${warns === 1 ? "" : "s"}` : "All checks pass"} data-testid="map-checks">
      <ul className="app-list">
        {sorted.map((c) => (
          <li key={c.id} className="app-list__row" data-check={c.id} data-level={c.ok ? "ok" : c.level}>
            <Badge tone={c.ok ? "success" : c.level === "block" ? "danger" : "warning"}>{c.ok ? "ok" : c.level}</Badge>
            <span className="app-grow">{c.message}</span>
            {c.page !== undefined && <PageRef page={c.page} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ZoneKeyCard({ record, onSelect }: { record: SiteMap; onSelect: (id: string) => void }) {
  const ctx = useCampaign();
  const rows = useMemo(() => zoneKeyRows(record, ctx.module.module), [record, ctx.module]);
  const rooms = record.layout?.numbering === "key";
  return (
    <Card
      title={rooms ? "Room key" : "Zone key"}
      subtitle={rooms ? "Every room, and any passage with something in it, for the GM: what to read aloud, who is there, traps and treasure." : "One row per zone, for the GM."}
      data-testid="zone-key"
      actions={
        <>
          <Button size="sm" onClick={() => download("Zone key", (d) => d.downloadZoneKey(record, "md", ctx.module.module))} data-testid="zone-key-md">
            Markdown
          </Button>
          <Button size="sm" onClick={() => download("Zone key", (d) => d.downloadZoneKey(record, "csv", ctx.module.module))} data-testid="zone-key-csv">
            CSV
          </Button>
        </>
      }
    >
      <div className="prep-sitemap__tablewrap">{rooms ? <RoomKeyTable rows={rows} onSelect={onSelect} /> : <ZoneKeyTable rows={rows} onSelect={onSelect} />}</div>
    </Card>
  );
}

function ZoneKeyTable({ rows, onSelect }: { rows: ZoneKeyRow[]; onSelect: (id: string) => void }) {
  return (
    <table className="prep-sitemap__table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Zone</th>
          <th scope="col">Cover</th>
          <th scope="col">Flags</th>
          <th scope="col">Exits</th>
          <th scope="col">Details</th>
          <th scope="col">Salvage</th>
          <th scope="col">Clues</th>
          <th scope="col">GM note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-zone-row={r.id}>
            <td>{r.number}</td>
            <th scope="row">
              <button type="button" className="app-linkbtn" onClick={() => onSelect(r.id)}>
                {r.name}
              </button>
              {r.layer === "duct" && (
                <span className="cf-muted" data-zone-sheet={r.deck}>
                  {" "}
                  {r.id} · {r.deckName}
                </span>
              )}
            </th>
            <td>{r.cover}</td>
            <td>{r.flags.join(", ")}</td>
            <td title={r.exits.map(exitText).join("; ")}>
              {r.exits.map((e, i) => (
                <ExitLine key={i} e={e} />
              ))}
            </td>
            <td>{r.details.join("; ")}</td>
            <td>{r.salvage.join("; ")}</td>
            <td>{r.clues.join("; ")}</td>
            <td>{r.gmNote}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The key of a map numbered by rooms: read-aloud, description, encounters (linked to their entities), traps, treasure. */
function RoomKeyTable({ rows, onSelect }: { rows: ZoneKeyRow[]; onSelect: (id: string) => void }) {
  const ctx = useCampaign();
  const multi = new Set(rows.map((r) => r.deck)).size > 1;
  const marks = (r: ZoneKeyRow, g: "encounters" | "traps" | "treasure") =>
    r.marks
      .filter((m) => markGroup(m.kind) === g)
      .map((m) => <MarkLine key={m.id} m={m} />);
  return (
    <table className="prep-sitemap__table prep-sitemap__roomkey">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Room</th>
          <th scope="col">Read aloud</th>
          <th scope="col">Description</th>
          <th scope="col">Encounters</th>
          <th scope="col">Traps</th>
          <th scope="col">Treasure</th>
          <th scope="col">Exits</th>
          <th scope="col">GM note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-zone-row={r.id}>
            <td>{r.number}</td>
            <th scope="row">
              <button type="button" className="app-linkbtn" onClick={() => onSelect(r.id)}>
                {r.name}
              </button>
              {(r.number === undefined || multi) && (
                <span className="cf-muted">
                  {" "}
                  {[r.number === undefined ? r.id : undefined, multi ? r.deckName : undefined].filter(Boolean).join(" · ")}
                </span>
              )}
              {r.flags.length > 0 && <div className="cf-muted app-small">{r.flags.join(", ")}</div>}
              {r.entity && (
                <div className="app-small">
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: r.entity }} className="app-link" data-room-entity={r.id}>
                    Open the room
                  </Link>
                </div>
              )}
            </th>
            <td className="prep-sitemap__readaloud">{r.readAloud}</td>
            <td>{r.details.join("; ")}</td>
            <td>{marks(r, "encounters")}</td>
            <td>{marks(r, "traps")}</td>
            <td>{marks(r, "treasure")}</td>
            <td title={r.exits.map(exitText).join("; ")}>
              {r.exits.map((e, i) => (
                <ExitLine key={i} e={e} />
              ))}
            </td>
            <td>{r.gmNote}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DistanceCard({ record, maxAct }: { record: SiteMap; maxAct: number }) {
  const ctx = useCampaign();
  const [keyOnly, setKeyOnly] = useState(true);
  const [act, setAct] = useState(1);
  const table = useMemo(() => distanceTable(record, { keyOnly, act, module: ctx.module.module, useLive: false }), [record, keyOnly, act, ctx.module]);
  const bandLabel = new Map(table.bands.map((b) => [b.id, b.label]));
  return (
    <Card
      title="Distance table"
      subtitle="Zones crossed on the shortest passable path, with the range band, for the act's border states."
      data-testid="distance-table"
      actions={
        <>
          <label className="app-row">
            <input type="checkbox" className="cf-checkbox" checked={!keyOnly} onChange={(e) => setKeyOnly(!e.target.checked)} aria-label="All zones" />
            All zones
          </label>
          {maxAct > 1 && (
            <select className="cf-select" aria-label="Act" value={act} onChange={(e) => setAct(Number(e.target.value))}>
              {Array.from({ length: maxAct }, (_, i) => i + 1).map((a) => (
                <option key={a} value={a}>
                  Act {a}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => download("Distance table", (d) => d.downloadDistanceTable(record, "csv", { keyOnly, act, module: ctx.module.module }))} data-testid="distance-csv">
            CSV
          </Button>
          <Button size="sm" onClick={() => download("Distance table", (d) => d.downloadDistanceTable(record, "json", { keyOnly, act, module: ctx.module.module }))} data-testid="distance-json">
            JSON
          </Button>
        </>
      }
    >
      {table.zones.length === 0 ? (
        <p className="cf-muted">No key zones on this map. Tick “All zones”.</p>
      ) : (
        <div className="prep-sitemap__tablewrap">
          <table className="prep-sitemap__table prep-sitemap__matrix">
            <thead>
              <tr>
                <th scope="col">From \ to</th>
                {table.zones.map((z) => (
                  <th key={z.id} scope="col" title={z.name}>
                    {z.number ?? z.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.zones.map((a) => (
                <tr key={a.id}>
                  <th scope="row">
                    {a.number ?? ""} {a.name}
                  </th>
                  {table.zones.map((b) => {
                    const d = table.distance[a.id]?.[b.id];
                    const band = table.band[a.id]?.[b.id];
                    return (
                      <td key={b.id} data-from={a.id} data-to={b.id}>
                        {d === undefined ? <span className="cf-muted">—</span> : d}
                        {band && <span className="cf-muted"> {bandLabel.get(band) ?? band}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
