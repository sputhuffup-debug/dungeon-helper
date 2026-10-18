/** Handouts (scene, act, adventure) and the scene's clues, each revealed with one tap and logged with the scene. */
import { type Entity, type Handout, type Id, type Scene, type Visibility } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { Badge, Button, Card, type BadgeTone } from "../../components/ui";
import { RichTextView } from "../../editor";
import { useAssetUrl, useCampaign, useList, useRecord } from "../../state/hooks";
import { revealEntityAtTable, revealHandout } from "../../state/tableActions";
import { useEntities } from "./hooks";

const VIS: Record<Visibility["level"], { label: string; tone: BadgeTone }> = {
  gm: { label: "GM only", tone: "muted" },
  some_players: { label: "Some players", tone: "warning" },
  players: { label: "Players", tone: "accent" },
  revealed: { label: "Revealed", tone: "success" },
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const v = VIS[visibility.level] ?? VIS.gm;
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

function HandoutRow({ handout, onReveal, sessionId }: { handout: Handout; onReveal: () => void; sessionId: Id }) {
  const [open, setOpen] = useState(false);
  const character = useRecord("entities", handout.character);
  const url = useAssetUrl(open ? handout.asset : undefined);
  const revealed = handout.visibility.level === "revealed";
  return (
    <li className="app-reveal" data-handout={handout.id}>
      <div className="app-reveal__row">
        <button type="button" className="app-linkbtn app-reveal__title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {handout.title}
        </button>
        <Badge>{handout.kind}</Badge>
        {character && <span className="cf-muted">for {character.name}</span>}
        <VisibilityBadge visibility={handout.visibility} />
        {revealed && handout.revealedIn === sessionId && <span className="cf-muted">this session</span>}
        <Button variant={revealed ? "ghost" : "primary"} onClick={onReveal} disabled={revealed} aria-label={`Reveal ${handout.title}`}>
          {revealed ? "Revealed" : "Reveal"}
        </Button>
      </div>
      {open && (
        <div className="app-reveal__body">
          {url && <img src={url} alt={handout.title} className="app-reveal__image" />}
          {handout.bodyDoc && <RichTextView docId={handout.bodyDoc} placeholder="Empty handout." />}
        </div>
      )}
    </li>
  );
}

export function RevealPanel({ sessionId, scene }: { sessionId: Id; scene: Scene | undefined }) {
  const ctx = useCampaign();
  const act = useRecord("acts", scene?.act);
  const adventureId = act?.adventure;
  const all = useList("handouts");
  const handouts = useMemo(() => {
    const groups: Array<{ title: string; items: Handout[] }> = [];
    const of = (kind: "scene" | "act" | "adventure", id: Id | undefined) => (id ? all.filter((h) => h.attachedTo?.kind === kind && h.attachedTo.id === id) : []);
    const sceneItems = of("scene", scene?.id);
    const actItems = of("act", act?.id);
    const advItems = of("adventure", adventureId);
    if (sceneItems.length) groups.push({ title: "This scene", items: sceneItems });
    if (actItems.length) groups.push({ title: act ? `Act ${act.number}` : "Act", items: actItems });
    if (advItems.length) groups.push({ title: "Adventure", items: advItems });
    if (!scene) {
      const loose = all.filter((h) => !h.attachedTo);
      if (loose.length) groups.push({ title: "Campaign", items: loose });
    }
    return groups;
  }, [all, scene, act, adventureId]);
  const clues = useEntities(scene?.clues ?? []);

  return (
    <Card title="Reveal" className="app-table__reveal" data-testid="reveal-panel">
      {handouts.length === 0 && clues.length === 0 && <p className="cf-muted">No handouts or clues for this scene.</p>}
      {handouts.map((g) => (
        <section key={g.title} aria-label={`Handouts: ${g.title}`}>
          <h4 className="app-table__group-title">{g.title}</h4>
          <ul className="app-reveals">
            {g.items.map((h) => (
              <HandoutRow key={h.id} handout={h} sessionId={sessionId} onReveal={() => revealHandout(ctx, sessionId, h.id, scene?.id)} />
            ))}
          </ul>
        </section>
      ))}
      {clues.length > 0 && (
        <section aria-label="Clues">
          <h4 className="app-table__group-title">Clues</h4>
          <ul className="app-reveals">
            {clues.map((c: Entity) => {
              const revealed = c.visibility.level === "revealed";
              const text = typeof c.fields.text === "string" ? c.fields.text : c.summary;
              return (
                <li key={c.id} className="app-reveal" data-clue={c.id}>
                  <div className="app-reveal__row">
                    <span className="app-reveal__title">{c.name}</span>
                    <VisibilityBadge visibility={c.visibility} />
                    <Button variant={revealed ? "ghost" : "primary"} onClick={() => revealEntityAtTable(ctx, sessionId, c.id, scene?.id)} disabled={revealed} aria-label={`Reveal ${c.name}`}>
                      {revealed ? "Revealed" : "Reveal"}
                    </Button>
                  </div>
                  {text && <p className="cf-muted app-reveal__body">{text}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Card>
  );
}
