/**
 * "Previously on…" on the session page (planned and running sessions): the
 * recap built from what the campaign recorded since the last session (or a
 * chosen span), as the GM's version and the players' read-aloud. Each line
 * can be switched off, rewritten, or followed to its record; the GM can add
 * lines; *Regenerate* rebuilds from the data and keeps those choices; *Show
 * on player screen* puts the read-aloud on the players' window.
 */
import { hasRecapSource, recapReadAloud, recapSpanLabel, type RecapLine, type RecapSection, type Session } from "@campaign-forge/core";
import type { RecapAudience } from "@campaign-forge/module-sdk";
import { useMemo, useState } from "react";
import { AutoGrowText, Badge, Button, Card, IconButton, Tabs, pushToast } from "../../components/ui";
import { useCampaign, useList } from "../../state/hooks";
import { RECAP_SPANS, addOwnRecapLine, buildRecap, removeOwnRecapLine, rewriteRecapLine, setRecapLineOn, showRecapOnPlayerScreen, spanId } from "../../state/recapActions";
import { useCrossTabSync } from "../table/hooks";
import { RecapText } from "./RecapText";
import "./recap.css";

const count = (sections: RecapSection[]) => sections.reduce((n, s) => n + s.lines.filter((l) => !l.off).length, 0);

export function RecapCard({ session }: { session: Session }) {
  const ctx = useCampaign();
  // an open player screen follows what the card shows it
  useCrossTabSync();
  const sessions = useList("sessions");
  const recap = session.recap;
  const [tab, setTab] = useState<RecapAudience>("gm");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const canRecap = useMemo(() => hasRecapSource({ sessions: Object.fromEntries(sessions.map((s) => [s.id, s])) }, session.id), [sessions, session.id]);
  if (!recap && !canRecap) return null;

  const covered = (recap?.sessions ?? []).map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s);
  const coveredLabel = covered.length === 0 ? "" : covered.length === 1 ? `Session ${covered[0]!.number}` : `Sessions ${covered[0]!.number} to ${covered[covered.length - 1]!.number}`;
  const build = async (span = recap?.span) => {
    setBusy(true);
    try {
      await buildRecap(ctx, session.id, span);
    } catch (e) {
      pushToast(`Could not build the recap: ${e instanceof Error ? e.message : String(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const shown = !!recap?.shown;
  const playerUrl = `/c/${ctx.campaignId}/table/${session.id}?view=players`;

  const span = (
    <select className="cf-select" aria-label="What the recap covers" value={spanId(recap?.span)} disabled={busy} onChange={(e) => void build(RECAP_SPANS.find((s) => s.id === e.target.value)?.span)} data-testid="recap-span">
      {RECAP_SPANS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );

  return (
    <Card
      className="app-recap"
      title="Previously on…"
      subtitle={recap ? `${recapSpanLabel(recap.span)}${coveredLabel ? ` · ${coveredLabel}` : ""}` : "A recap of what happened, built from what the campaign recorded."}
      actions={
        recap ? (
          <>
            {span}
            <Button size="sm" onClick={() => void build()} disabled={busy} title="Rebuild the lines from the campaign. Lines you switched off, rewrote or added are kept." data-testid="recap-regenerate">
              {busy ? "Building…" : "Regenerate"}
            </Button>
          </>
        ) : undefined
      }
      data-testid="recap-card"
    >
      {!recap ? (
        <div className="app-row">
          <p className="cf-muted app-grow">Nothing built yet for this session.</p>
          <Button variant="primary" onClick={() => void build()} disabled={busy} data-testid="recap-build">
            {busy ? "Building…" : "Build the recap"}
          </Button>
        </div>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(id) => setTab(id as RecapAudience)}
            tabs={[
              { id: "gm", label: `For you (${count(recap.gm)})`, content: <RecapSide session={session} audience="gm" sections={recap.gm} /> },
              { id: "players", label: `Read-aloud (${count(recap.players)})`, content: <RecapSide session={session} audience="players" sections={recap.players} /> },
            ]}
          />
          <form
            className="app-row app-recap__add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              addOwnRecapLine(ctx, session.id, tab, draft);
              setDraft("");
            }}
          >
            <AutoGrowText className="cf-input app-grow" aria-label="New recap line" placeholder={tab === "gm" ? "Add a note for yourself…" : "Add a line to read aloud…"} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
          <div className="app-row app-recap__footer">
            <Button variant={shown ? "default" : "primary"} size="sm" onClick={() => showRecapOnPlayerScreen(ctx, session.id, !shown)} data-testid="recap-show">
              {shown ? "Hide from player screen" : "Show on player screen"}
            </Button>
            <a className="cf-btn cf-btn--ghost cf-btn--sm" href={playerUrl} target="_blank" rel="noreferrer" data-testid="recap-player-screen">
              Open player screen
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(recapReadAloud(recap.players)).then(
                  () => pushToast("Read-aloud copied.", { tone: "success" }),
                  () => undefined,
                )
              }
            >
              Copy read-aloud
            </Button>
            {shown && <Badge tone="success">On the player screen</Badge>}
            <span className="cf-muted app-small app-recap__hint">Regenerate keeps what you switched off, rewrote or added.</span>
          </div>
        </>
      )}
    </Card>
  );
}

function RecapSide({ session, audience, sections }: { session: Session; audience: RecapAudience; sections: RecapSection[] }) {
  if (sections.length === 0) return <p className="cf-muted">{audience === "gm" ? "Nothing recorded to recap." : "Nothing the players can be told yet: add a line, or reveal something first."}</p>;
  return (
    <div className="app-recap__sections" data-testid={`recap-${audience}`}>
      {sections.map((s) => (
        <section key={s.id} className={`app-recap__section${s.id === "secrets" ? " app-recap__section--secrets" : ""}`} data-section={s.id} aria-label={s.title}>
          <h4 className="app-recap__heading">{s.title}</h4>
          <ul className="app-recap__lines">
            {s.lines.map((l) => (
              <RecapLineRow key={`${l.key}|${l.ref ?? ""}`} session={session} audience={audience} section={s.id} line={l} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RecapLineRow({ session, audience, section, line }: { session: Session; audience: RecapAudience; section: string; line: RecapLine }) {
  const ctx = useCampaign();
  const [editing, setEditing] = useState<string | undefined>();
  const at = { audience, section, key: line.key, ref: line.ref };
  return (
    <li className={`app-recap__line${line.off ? " app-recap__line--off" : ""}`} data-testid="recap-line" data-off={line.off ? "true" : "false"}>
      <input type="checkbox" className="cf-checkbox" checked={!line.off} aria-label={line.off ? "Switch this line on" : "Switch this line off"} onChange={(e) => setRecapLineOn(ctx, session.id, at, e.target.checked)} />
      {editing !== undefined ? (
        <form
          className="app-recap__edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (editing.trim()) rewriteRecapLine(ctx, session.id, at, editing);
            setEditing(undefined);
          }}
        >
          <AutoGrowText multiline className="cf-input" aria-label="Line text" value={editing} onChange={(e) => setEditing(e.target.value)} autoFocus />
          <div className="app-row">
            <Button type="submit" size="sm" variant="primary">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <span className="app-recap__text" data-testid="recap-line-text">
          <RecapText text={line.text} links={line.links} campaignId={ctx.campaignId} />
          {line.edited && <Badge className="app-recap__badge">edited</Badge>}
          {line.custom && <Badge className="app-recap__badge">yours</Badge>}
          {line.optIn && (
            <Badge className="app-recap__badge" title="Your own words (e.g. the wrap-up summary), off until you switch it on: read it through for secrets first" data-testid="recap-optin">
              your words
            </Badge>
          )}
        </span>
      )}
      {editing === undefined && (
        <span className="app-recap__tools">
          <IconButton size="sm" variant="ghost" icon="✎" label="Rewrite this line" onClick={() => setEditing(line.text)} />
          {line.custom && <IconButton size="sm" variant="ghost" icon="×" label="Remove this line" onClick={() => removeOwnRecapLine(ctx, session.id, at)} />}
        </span>
      )}
    </li>
  );
}
