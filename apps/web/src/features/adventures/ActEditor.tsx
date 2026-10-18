/** Act pane: number, title, goal, pacing notes and the act's handouts (per-character agendas included). */
import type { Act, Handout, HandoutKind } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import { Badge, Button, Card, IconButton } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { addHandout, actHandouts, deleteHandout, ensureDoc, updateHandout } from "../../state/prepActions";
import { useCampaign, useMapVersion, useMeta } from "../../state/hooks";
import { CommitInput, EntityRefInput, useTypesOfKind } from "./fields";

export function ActEditor({ act }: { act: Act }) {
  const ctx = useCampaign();
  return (
    <div className="app-stack" data-testid="act-editor">
      <Card title={`Act ${act.number}${act.title ? `: ${act.title}` : ""}`}>
        <div className="app-form__row">
          <label className="app-label prep-narrow">
            <span>Number</span>
            <input
              className="cf-input"
              type="number"
              min={1}
              aria-label="Act number"
              value={act.number}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1) ctx.store.update("acts", act.id, { number: Math.round(n) });
              }}
            />
          </label>
          <label className="app-label">
            <span>Title</span>
            <CommitInput value={act.title ?? ""} label="Act title" onCommit={(v) => ctx.store.update("acts", act.id, { title: v.trim() || undefined })} />
          </label>
        </div>
        <label className="app-label">
          <span>Goal</span>
          <CommitInput value={act.goal ?? ""} label="Act goal" placeholder="What this act must achieve" onCommit={(v) => ctx.store.update("acts", act.id, { goal: v.trim() || undefined })} />
        </label>
      </Card>
      <Card title="Pacing notes">
        {act.pacingDoc ? (
          <RichTextEditor docId={act.pacingDoc} label="Pacing notes" placeholder="Tempo, pressure, when to end the act…" />
        ) : (
          <Button size="sm" onClick={() => ensureDoc(ctx, "acts", act.id, "pacingDoc")}>
            Add pacing notes
          </Button>
        )}
      </Card>
      <HandoutsCard act={act} />
    </div>
  );
}

function HandoutsCard({ act }: { act: Act }) {
  const ctx = useCampaign();
  const version = useMapVersion("handouts");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handouts = useMemo(() => actHandouts(ctx.store, act), [ctx.store, act, version]);
  const agendas = handouts.filter((h) => h.kind === "agenda");
  const others = handouts.filter((h) => h.kind !== "agenda");
  return (
    <Card
      title="Handouts"
      subtitle="Agendas are some-players handouts: one per character, revealed only to that player."
      actions={
        <>
          <Button size="sm" onClick={() => addHandout(ctx, act.id, { kind: "agenda" })} data-testid="add-agenda">
            + Agenda
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addHandout(ctx, act.id, { kind: "text" })}>
            + Handout
          </Button>
        </>
      }
    >
      {handouts.length === 0 && <p className="cf-muted">No handouts for this act.</p>}
      {agendas.length > 0 && <h4 className="prep-h4">Agendas ({agendas.length})</h4>}
      <ul className="prep-handouts" data-testid="handouts">
        {agendas.map((h) => (
          <HandoutRow key={h.id} handout={h} />
        ))}
      </ul>
      {others.length > 0 && <h4 className="prep-h4">Other handouts</h4>}
      <ul className="prep-handouts">
        {others.map((h) => (
          <HandoutRow key={h.id} handout={h} />
        ))}
      </ul>
    </Card>
  );
}

const KINDS: HandoutKind[] = ["agenda", "text", "card", "image"];

function HandoutRow({ handout }: { handout: Handout }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const characterTypes = useTypesOfKind(["character"]);
  const [open, setOpen] = useState(false);
  const character = handout.character ? ctx.store.get("entities", handout.character) : undefined;
  return (
    <li className="prep-handout">
      <div className="app-row">
        <button type="button" className="prep-disclosure" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${open ? "Collapse" : "Expand"} ${handout.title}`}>
          {open ? "▾" : "▸"}
        </button>
        <CommitInput value={handout.title} label="Handout title" className="cf-input prep-handout__title" onCommit={(v) => updateHandout(ctx, handout.id, { title: v.trim() || handout.title })} />
        {handout.kind === "agenda" && (character ? <Badge tone="accent">{character.name}</Badge> : <Badge tone="warning">no character</Badge>)}
        <VisibilitySelect value={handout.visibility} onChange={(v) => updateHandout(ctx, handout.id, { visibility: v })} hasPlayers={meta.members.some((m) => m.role === "player")} />
        <IconButton size="sm" variant="ghost" label={`Delete ${handout.title}`} icon="×" onClick={() => deleteHandout(ctx, handout.id)} />
      </div>
      {open && (
        <div className="prep-handout__body app-stack">
          <div className="app-form__row">
            <label className="app-label prep-narrow">
              <span>Kind</span>
              <select className="cf-select" aria-label="Handout kind" value={handout.kind} onChange={(e) => updateHandout(ctx, handout.id, { kind: e.target.value as HandoutKind })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <div className="app-label">
              <span>{handout.kind === "agenda" ? "For character" : "About character (optional)"}</span>
              <EntityRefInput value={handout.character} types={characterTypes} label="Character" onChange={(id) => updateHandout(ctx, handout.id, { character: id })} />
            </div>
          </div>
          {handout.bodyDoc ? (
            <RichTextEditor docId={handout.bodyDoc} label={`${handout.title} body`} placeholder="Write the handout…" />
          ) : (
            <p className="cf-muted">This handout has no text body.</p>
          )}
        </div>
      )}
    </li>
  );
}
