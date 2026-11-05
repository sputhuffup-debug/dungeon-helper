/** Buttons that open a run's chained procedures in the workbench. */
import type { GeneratorRun, Id } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useCampaign } from "../../state/hooks";
import { chainOptions } from "./runner";

/** Buttons for the chained procedures a run offers (but those in `exclude`, offered another way beside them). */
export function ChainButtons({ run, within, exclude }: { run: GeneratorRun; within?: Id; exclude?: string[] }) {
  const ctx = useCampaign();
  const procedure = ctx.module.procedure(run.procedure);
  const options = useMemo(() => (procedure ? chainOptions(ctx.module, procedure, run) : []).filter((o) => !exclude?.includes(o.procedure)), [ctx.module, procedure, run, exclude]);
  if (options.length === 0) return null;
  const parent = within ?? run.produced[0];
  return (
    <div className="app-row prep-chains" data-testid="chains">
      {options.map((o) => (
        <Link
          key={o.index}
          to="/c/$campaignId/generate/$procedureId"
          params={{ campaignId: ctx.campaignId, procedureId: o.procedure }}
          search={parent ? { chainFrom: run.id, chain: o.index, within: parent } : { chainFrom: run.id, chain: o.index }}
          className="cf-btn cf-btn--sm"
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
