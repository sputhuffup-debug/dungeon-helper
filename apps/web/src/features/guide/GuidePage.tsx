/**
 * The Guide page: the game module's step-by-step guide (`GameModule.guide`).
 *
 * - `/c/$campaignId/guide`: in a campaign, every step's "Take me there"
 *   links open that page of this campaign (an entity link once something
 *   matches, e.g. "Open the job" after a job is taken).
 * - `/guide/$moduleId`: from the campaign list, before there is a campaign:
 *   the same text and images, without the links.
 */
import { guideFitsMode, matchSetupEntity, type GuideLink } from "@campaign-forge/module-sdk";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loading } from "../../components/Loading";
import { EmptyState } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { loadModuleById } from "../../modules/registry";
import { useCampaign, useMeta } from "../../state/hooks";
import { setupLinkTarget, useSetupSnapshot } from "../../state/setupActions";
import { GuideView } from "./GuideView";
import type { LoadedModule } from "@campaign-forge/module-sdk";

export function GuidePage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const snapshot = useSetupSnapshot();
  const guide = ctx.module.module.guide;
  if (!guide) {
    return (
      <div className="app-page">
        <EmptyState title="No guide for this game yet" text={`${ctx.module.manifest.name} has no step-by-step guide. The setup checklist on Home still walks a new campaign to its first session.`} />
      </div>
    );
  }
  const modeName = (id: string) => ctx.module.manifest.modes.find((m) => m.id === id)?.name ?? id;
  const linkTarget = (link: GuideLink) => {
    if (link.entity !== undefined) {
      const e = matchSetupEntity(link.entity, snapshot);
      return e ? setupLinkTarget({ ...link, entityId: e.id }, ctx.campaignId) : undefined;
    }
    return setupLinkTarget(link, ctx.campaignId);
  };
  const notice = guideFitsMode(guide, meta.mode) ? undefined : (
    <p className="app-note guide-notice" data-testid="guide-mode-note">
      Written for {(guide.mode ?? []).map(modeName).join(" or ")} play. This campaign is {modeName(meta.mode)}, so some steps are different or not there.
    </p>
  );
  return (
    <div className="app-page" data-testid="guide-page">
      <GuideView guide={guide} moduleId={ctx.module.manifest.id} linkTarget={linkTarget} notice={notice} />
    </div>
  );
}

export function ModuleGuidePage() {
  const { moduleId } = useParams({ from: "/guide/$moduleId" });
  const [state, setState] = useState<{ module?: LoadedModule; error?: string }>({});
  useEffect(() => {
    let live = true;
    setState({});
    loadModuleById(moduleId).then(
      (module) => live && setState({ module }),
      (e: unknown) => live && setState({ error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [moduleId]);
  const back = (
    <Link to="/" className="cf-btn cf-btn--sm">
      ← All campaigns
    </Link>
  );
  if (state.error) return <div className="app-page"><EmptyState title="Could not load the game module" text={state.error} action={back} /></div>;
  if (!state.module) return <Loading label="Loading the guide…" />;
  const guide = state.module.module.guide;
  if (!guide) return <div className="app-page"><EmptyState title="No guide for this game yet" text={`${state.module.manifest.name} has no step-by-step guide.`} action={back} /></div>;
  return (
    <div className="app-page" data-testid="guide-page">
      <div className="app-row">{back}</div>
      <GuideView
        guide={guide}
        moduleId={state.module.manifest.id}
        notice={
          <p className="app-note guide-notice" data-testid="guide-no-campaign">
            Start a campaign with {state.module.manifest.name} to follow along: in a campaign, each step links straight to where it is done (Home, then Guide).
          </p>
        }
      />
    </div>
  );
}
