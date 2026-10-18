/** Adventure overview: player intro, GM situation and epilogue bodies, plus a summary of the acts. */
import type { Adventure } from "@campaign-forge/core";
import { Button, Card } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { ensureAdventureDocs } from "../../state/prepActions";
import { useCampaign, useList } from "../../state/hooks";

export function OverviewEditor({ adventure, onSelect }: { adventure: Adventure; onSelect: (node: string) => void }) {
  const ctx = useCampaign();
  const acts = useList("acts");
  const missing = !adventure.playerIntroDoc || !adventure.gmSituationDoc || !adventure.epilogueDoc;
  return (
    <div className="app-stack" data-testid="overview-editor">
      {missing && (
        <p className="app-note app-row">
          This adventure has no intro, situation or epilogue sections yet.
          <Button size="sm" onClick={() => ensureAdventureDocs(ctx, adventure.id)}>
            Add sections
          </Button>
        </p>
      )}
      {adventure.playerIntroDoc && (
        <Card title="Player introduction" subtitle="Read aloud at the start. Players may see this.">
          <RichTextEditor docId={adventure.playerIntroDoc} label="Player introduction" placeholder="The briefing the players hear…" />
        </Card>
      )}
      {adventure.gmSituationDoc && (
        <Card title="The situation (GM only)" subtitle="What is really going on.">
          <RichTextEditor docId={adventure.gmSituationDoc} label="GM situation" placeholder="Who knows what, what the threat wants, the countdown…" />
        </Card>
      )}
      <Card title="Acts">
        {adventure.acts.length === 0 ? (
          <p className="cf-muted">No acts yet. Add one from the outline.</p>
        ) : (
          <ol className="prep-overview-acts">
            {adventure.acts.map((id) => {
              const act = acts.find((a) => a.id === id);
              if (!act) return null;
              return (
                <li key={id}>
                  <button type="button" className="app-linkbtn" onClick={() => onSelect(`act:${id}`)}>
                    Act {act.number}
                    {act.title ? `: ${act.title}` : ""}
                  </button>
                  {act.goal && <span className="cf-muted"> — {act.goal}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      {adventure.epilogueDoc && (
        <Card title="Epilogue">
          <RichTextEditor docId={adventure.epilogueDoc} label="Epilogue" placeholder="What happens to the survivors…" />
        </Card>
      )}
    </div>
  );
}
