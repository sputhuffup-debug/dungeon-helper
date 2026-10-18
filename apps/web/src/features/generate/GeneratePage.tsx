/** `/generate`: the module's procedures for the campaign's play mode, plus recent runs. */
import type { GeneratorRun } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, EmptyState, PageRef } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";

export function GeneratePage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const procedures = ctx.module.forMode(meta.mode).procedures;
  const modeName = ctx.module.manifest.modes.find((m) => m.id === meta.mode)?.name ?? meta.mode;
  const runs = useList("generatorRuns");
  const recent = useMemo(() => [...runs].sort((a: GeneratorRun, b: GeneratorRun) => (a.created < b.created ? 1 : -1)).slice(0, 8), [runs]);

  return (
    <div className="app-page">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">Generate</h1>
          <p className="cf-muted">
            {ctx.module.manifest.name} procedures for {modeName} play. Every step shows its roll; re-roll any step, then accept into the campaign.
          </p>
        </div>
      </header>
      {procedures.length === 0 ? (
        <EmptyState title="No generators" text="This module has no procedures for the campaign's play mode." />
      ) : (
        <ul className="app-cards" data-testid="procedures">
          {procedures.map((p) => (
            <li key={p.id}>
              <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId, procedureId: p.id }} className="prep-proc-card" data-testid={`procedure-${p.id}`}>
                <span className="prep-proc-card__head">
                  <strong>{p.name}</strong>
                  <PageRef page={p.page} />
                </span>
                {p.description && <span className="cf-muted">{p.description}</span>}
                <span className="app-row">
                  <Badge>{p.steps.length} steps</Badge>
                  {p.chains && p.chains.length > 0 && <Badge tone="accent">chains</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="app-section" aria-label="Recent runs">
        <h2 className="app-subtitle">Recent runs</h2>
        {recent.length === 0 ? (
          <p className="cf-muted">Nothing generated yet.</p>
        ) : (
          <ul className="app-list">
            {recent.map((r) => {
              const first = r.produced[0] ? ctx.store.get("entities", r.produced[0]) : undefined;
              return (
                <li key={r.id} className="app-list__row">
                  <strong>{ctx.module.procedure(r.procedure)?.name ?? r.procedure}</strong>
                  {first && (
                    <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: first.id }} className="app-link-strong">
                      {first.name}
                    </Link>
                  )}
                  <span className="cf-mono cf-muted">{r.seed}</span>
                  <span className="cf-muted">{relativeTime(r.created)}</span>
                  <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId, procedureId: r.procedure }} search={{ run: r.id }} className="cf-btn cf-btn--sm cf-btn--ghost app-list__end">
                    Re-open
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
