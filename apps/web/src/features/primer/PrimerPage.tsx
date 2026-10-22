/**
 * `/c/$campaignId/primer`: the campaign primer, the players' introduction to
 * the campaign for session 0. One rich-text section per topic with the
 * module's prompt above it; "Draft from campaign" fills the data-backed
 * sections from player-visible records; "Share primer" sends it through the
 * share dialog (images or the PDF packet).
 */
import { primerSectionDefs } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { lazyView } from "../../components/lazyView";
import { Button, Card, EmptyState, pushToast } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { applyPrimerDraft, draftConflicts, planSessionZero, primerDraft, primerSession, startPrimer } from "../../state/primerActions";
import type { PrimerDraft } from "@campaign-forge/core";
import "./primer.css";

const ShareDialog = lazyView(() => import("../share/ShareDialog").then((m) => m.ShareDialog), { what: "sharing", loading: () => null });

export function PrimerPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const campaignId = ctx.campaignId;
  const primer = meta.primer;
  const sessions = useList("sessions");
  const session = useMemo(() => primerSession(sessions), [sessions]);
  const defs = useMemo(() => new Map(primerSectionDefs(ctx.module.module).map((d) => [d.id, d] as const)), [ctx.module]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ draft: PrimerDraft; titles: string[] } | undefined>();
  const [sharing, setSharing] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const write = async (draft: PrimerDraft) => {
    const written = await applyPrimerDraft(ctx, draft);
    pushToast(written.length ? `Drafted ${written.length} section${written.length === 1 ? "" : "s"} from player-visible campaign data. Edit anything before you share.` : "Nothing in the campaign to draft from yet.", { tone: written.length ? "success" : "info" });
  };

  const onDraft = () =>
    run(async () => {
      const draft = await primerDraft(ctx);
      const conflicts = await draftConflicts(ctx, draft);
      if (conflicts.length) setConfirm({ draft, titles: conflicts.map((c) => c.title) });
      else await write(draft);
    });

  return (
    <div className="app-page app-primer" data-testid="primer-page">
      <header className="app-page__header">
        <div className="app-stack app-grow">
          <Link to="/c/$campaignId/home" params={{ campaignId }} className="cf-muted">
            ← Home
          </Link>
          <h1 className="app-title">Campaign primer</h1>
          <p className="cf-muted app-primer__lead">
            What the players should know before session 0: the pitch, the setting, common knowledge, tone and safety, house rules and how to make a character. Prompts in grey are for you; only the text you write is shared.
          </p>
        </div>
        {primer && (
          <div className="app-row">
            <Button onClick={() => void onDraft()} disabled={busy} data-testid="primer-draft" title="Fill sections from player-visible places, factions, timeline, characters and the adventure's player intro">
              Draft from campaign
            </Button>
            {session ? (
              <Button variant="primary" onClick={() => setSharing(true)} data-testid="primer-share">
                Share primer
              </Button>
            ) : (
              <Button variant="primary" onClick={() => planSessionZero(ctx)} data-testid="primer-plan-zero" title="Shares are recorded with a session">
                Plan session 0 to share
              </Button>
            )}
          </div>
        )}
      </header>

      {!primer ? (
        <EmptyState
          title="No primer yet"
          text="Start one with this game's prompts and starter text, then draft from the campaign or write your own."
          action={
            <Button variant="primary" onClick={() => void run(async () => void (await startPrimer(ctx)))} disabled={busy} data-testid="primer-start">
              Start the primer
            </Button>
          }
        />
      ) : (
        <div className="app-stack">
          {primer.sections.map((s) => {
            const def = defs.get(s.id);
            return (
              <Card key={s.id} title={s.title} className="app-primer__section" data-section={s.id}>
                {def?.prompt && <p className="cf-muted app-primer__prompt">{def.prompt}</p>}
                <RichTextEditor docId={s.doc} label={s.title} placeholder="Write for the players… (leave empty to leave this section out)" />
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Replace text you wrote?"
        confirmLabel="Replace"
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(undefined);
          if (c) void run(() => write(c.draft));
        }}
      >
        <p>Drafting rewrites these sections from the campaign: {confirm?.titles.join(", ")}. Other sections stay as they are.</p>
      </ConfirmDialog>
      {sharing && session && <ShareDialog open onClose={() => setSharing(false)} sessionId={session.id} primer={{ defaultOn: true, only: true }} />}
    </div>
  );
}
