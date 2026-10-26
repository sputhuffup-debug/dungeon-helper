/**
 * GM screen: a printable quick reference built from the campaign's module
 * (its `gmScreen`, or panels built from its rule cards), for the campaign's
 * play mode. Pick the panels and their order and size, the paper, tri-fold
 * or cards and fold marks; preview both sides at scale; download the PDF.
 * The choices are saved with the campaign (`meta.settings.gmScreen`).
 */
import type { GmScreenSize } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, IconButton, pushToast } from "../../components/ui";
import { slug } from "../../lib/download";
import { errorMessage } from "../../lib/format";
import { defaultPaper } from "../../lib/paper";
import { updateMeta } from "../../state/actions";
import { useCampaign, useMeta } from "../../state/hooks";
import { sendFiles } from "../share/shareExport";
import { pageSvg, SCREEN_FORMATS, SCREEN_PAPERS, type ScreenFormat, type ScreenPaper } from "./gmScreenLayout";
import { buildGmScreen, gmScreenPdf, movePanel, readChoices, withChoices, type GmScreenChoices, type PanelChoice } from "./gmScreenModel";
import "./gmscreen.css";

const SIZE_LABELS: Record<GmScreenSize, string> = { third: "One fold", half: "Two folds", full: "Whole side" };

export function GmScreenPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const [busy, setBusy] = useState(false);
  const module = ctx.module.module;
  const choices = useMemo(() => readChoices(meta.settings, defaultPaper()), [meta.settings]);
  const build = useMemo(() => buildGmScreen(module, { mode: meta.mode, campaignName: meta.name, choices }), [module, meta.mode, meta.name, choices]);
  const previews = useMemo(() => build.layout.pages.map((p) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg(p))}`), [build]);
  const modeName = ctx.module.manifest.modes.find((m) => m.id === meta.mode)?.name ?? meta.mode;

  const save = (patch: Partial<GmScreenChoices>) => updateMeta(ctx, { settings: withChoices(ctx.store.meta().settings, { ...readChoices(ctx.store.meta().settings, choices.paper), ...patch }) });
  const order = build.choices.map((c) => c.panel.id);
  const setIncluded = (id: string, on: boolean) => save({ include: { ...choices.include, [id]: on }, order });
  const setSize = (id: string, size: GmScreenSize) => save({ sizes: { ...choices.sizes, [id]: size }, order });
  const move = (id: string, by: -1 | 1) => save({ order: movePanel(build.choices, id, by) });

  const download = async () => {
    setBusy(true);
    try {
      const bytes = gmScreenPdf(build.layout, { moduleName: ctx.module.manifest.name, title: build.screen.title, campaignName: meta.name });
      const name = `${slug(meta.name)}-gm-screen-${choices.paper}.pdf`;
      const result = await sendFiles([new File([bytes as BlobPart], name, { type: "application/pdf" })], { title: `${meta.name}: GM screen`, text: `GM screen for ${meta.name}`, zipName: `${slug(meta.name)}-gm-screen.zip` });
      if (result !== "cancelled") pushToast(result === "shared" ? "GM screen shared." : `Downloaded ${name}.`, { tone: "success" });
    } catch (e) {
      pushToast(`The GM screen could not be made: ${errorMessage(e)}`, { tone: "danger", timeout: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const sides: Array<{ side: "gm" | "players"; title: string; hint: string }> = [
    { side: "gm", title: "GM side", hint: "Faces you." },
    { side: "players", title: "Player side", hint: "Faces the table: print nothing secret here." },
  ];
  const pageLabel = (i: number) => (choices.format === "trifold" ? (i === 0 ? "GM side" : "Player side") : `Sheet ${i + 1} of ${build.layout.pages.length}`);

  return (
    <div className="app-page" data-testid="gm-screen-page">
      <header className="app-page__header">
        <h1 className="app-title">GM screen</h1>
        <div className="app-row">
          <Link to="/c/$campaignId/rules" params={{ campaignId: ctx.campaignId }} className="cf-btn">
            Rules
          </Link>
          <Button variant="primary" onClick={() => void download()} disabled={busy || build.layout.pages.length === 0} data-testid="gm-screen-download">
            {busy ? "Making the PDF…" : "Download PDF"}
          </Button>
        </div>
      </header>
      <p className="cf-muted">
        {build.screen.fallback
          ? `${ctx.module.manifest.name} has no GM screen of its own, so these panels are built from its rule cards by tag.`
          : `${ctx.module.manifest.name}'s quick reference, built from the module's own rule cards, tables and lists for ${modeName.toLowerCase()} play.`}{" "}
        {choices.format === "trifold" ? "Print both sides on one sheet (flip on the long edge) and fold on the marks." : "Two cards to a sheet: cut on the middle line."}
      </p>
      <div className="app-gmscreen">
        <div className="app-gmscreen__options">
          <Card title="Print">
            <div className="app-gmscreen__form">
              <label className="app-label">
                Layout
                <select className="cf-select" value={choices.format} onChange={(e) => save({ format: e.target.value as ScreenFormat })} data-testid="gm-screen-format">
                  {(Object.keys(SCREEN_FORMATS) as ScreenFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {SCREEN_FORMATS[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="app-label">
                Paper
                <select className="cf-select" value={choices.paper} onChange={(e) => save({ paper: e.target.value as ScreenPaper })} data-testid="gm-screen-paper">
                  {(Object.keys(SCREEN_PAPERS) as ScreenPaper[]).map((p) => (
                    <option key={p} value={p}>
                      {SCREEN_PAPERS[p].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="app-toggle">
                <input type="checkbox" className="cf-checkbox" checked={choices.foldMarks} onChange={(e) => save({ foldMarks: e.target.checked })} data-testid="gm-screen-fold" />
                {choices.format === "trifold" ? "Fold marks" : "Cut marks"}
              </label>
            </div>
          </Card>
          <Card title="Panels" subtitle="Tick what to print; order and size apply within each side.">
            <div className="app-stack" data-testid="gm-screen-panels">
              {sides.map(({ side, title, hint }) => {
                const list = build.choices.filter((c) => c.panel.side === side);
                if (list.length === 0) return null;
                return (
                  <section key={side} aria-label={title} className="app-gmscreen__side" data-side={side}>
                    <h4 className="app-table__group-title">{title}</h4>
                    <p className="cf-muted app-gmscreen__hint">{hint}</p>
                    <ul className="app-list">
                      {list.map((c, i) => (
                        <PanelRow key={c.panel.id} choice={c} first={i === 0} last={i === list.length - 1} onInclude={setIncluded} onSize={setSize} onMove={move} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </Card>
          {build.layout.overflow.length > 0 && (
            <div className="app-gmscreen__overflow" role="alert" data-testid="gm-screen-overflow">
              <strong>Not everything fits.</strong> Left out:
              <ul>
                {build.layout.overflow.map((o) => (
                  <li key={o.panel}>
                    <strong>{o.title}</strong>: {o.reason === "no-room" ? "no room left on its side; untick a panel or make one smaller" : `${o.dropped.join(", ")} (even at the smallest type; give it more room)`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <section className="app-gmscreen__preview" aria-label="Preview" data-testid="gm-screen-preview" data-paper={choices.paper} data-format={choices.format}>
          {build.layout.pages.map((p, i) => (
            <figure key={i} className="app-gmscreen__page" data-testid="gm-screen-page-preview">
              <figcaption className="cf-muted">{pageLabel(i)}</figcaption>
              <img src={previews[i]} alt={`${pageLabel(i)}: ${build.layout.text[i]!.slice(0, 12).join(" · ")}`} style={{ aspectRatio: `${p.width} / ${p.height}` }} />
            </figure>
          ))}
        </section>
      </div>
    </div>
  );
}

function PanelRow({ choice, first, last, onInclude, onSize, onMove }: { choice: PanelChoice; first: boolean; last: boolean; onInclude: (id: string, on: boolean) => void; onSize: (id: string, size: GmScreenSize) => void; onMove: (id: string, by: -1 | 1) => void }) {
  const p = choice.panel;
  return (
    <li className="app-list__row app-gmscreen__panel" data-panel={p.id}>
      <label className="app-toggle">
        <input type="checkbox" className="cf-checkbox" checked={choice.included} onChange={(e) => onInclude(p.id, e.target.checked)} aria-label={`Print ${p.title}`} />
        <span className={choice.included ? undefined : "cf-muted"}>{p.title}</span>
        {p.optional && <Badge>extra</Badge>}
      </label>
      <select className="cf-select" value={p.size} onChange={(e) => onSize(p.id, e.target.value as GmScreenSize)} aria-label={`Size of ${p.title}`}>
        {(Object.keys(SIZE_LABELS) as GmScreenSize[]).map((s) => (
          <option key={s} value={s}>
            {SIZE_LABELS[s]}
          </option>
        ))}
      </select>
      <IconButton label={`Move ${p.title} up`} icon="↑" disabled={first} onClick={() => onMove(p.id, -1)} />
      <IconButton label={`Move ${p.title} down`} icon="↓" disabled={last} onClick={() => onMove(p.id, 1)} />
    </li>
  );
}
