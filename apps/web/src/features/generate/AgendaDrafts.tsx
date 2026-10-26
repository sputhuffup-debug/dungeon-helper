/**
 * Agenda drafts in the generator workbench, for procedures that return
 * `results.agendaDrafts` (module-sdk `AgendaDraftSet`): one card per
 * character with the arc dealt, slots the GM re-rolls or pins one by one, an
 * editable draft per act, and the conflict report beside them. Accept writes
 * the drafts into each character's agendas (and the adventure's agenda
 * cards), asking before it replaces text the GM wrote.
 */
import type { Id } from "@campaign-forge/core";
import type { AgendaDraftCharacter, AgendaDraftReport, AgendaDraftSet, AgendaDraftSlot, GeneratedGraph } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, Dialog, IconButton, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { acceptAgendaDrafts, agendaOverwrites, type AgendaOverwrite, type AgendaWrite } from "../../state/agendaActions";
import { useCampaign } from "../../state/hooks";

/** The run's agenda drafts, when its results carry a well-formed set. */
export function agendaDraftsOf(graph: GeneratedGraph | undefined): AgendaDraftSet | undefined {
  const v = graph?.results.agendaDrafts as AgendaDraftSet | undefined;
  return v && typeof v === "object" && Array.isArray(v.characters) && typeof v.field === "string" ? v : undefined;
}

/** "<character id>/<act>" -> the GM's own text for that act. */
export type AgendaEdits = Record<string, string>;
export const editKey = (characterId: string, act: number) => `${characterId}/${act}`;

export interface AgendaSlotControls {
  partSeeds: Record<string, string>;
  pinnedParts: Record<string, unknown>;
  onReroll: (key: string) => void;
  onPin: (key: string) => void;
  onUnpin: (key: string) => void;
}

function SlotRow({ slot, who, controls, chip = false }: { slot: AgendaDraftSlot; who: string; controls: AgendaSlotControls; chip?: boolean }) {
  const pinned = Object.prototype.hasOwnProperty.call(controls.pinnedParts, slot.key);
  const rerolled = !pinned && controls.partSeeds[slot.key] !== undefined;
  const label = `${slot.label} for ${who}`;
  return (
    <li
      className={`agenda-slot${chip ? " agenda-slot--chip" : ""}${pinned ? " is-pinned" : ""}${rerolled ? " is-rerolled" : ""}`}
      data-slot={slot.key}
      title={chip ? `${slot.label}: ${slot.text}` : undefined}
    >
      <span className="agenda-slot__label">{slot.label}</span>
      <span className="agenda-slot__text">{slot.text}</span>
      <span className="agenda-slot__tools">
        <IconButton size="sm" variant="ghost" icon="↻" label={`Re-roll ${label}`} onClick={() => controls.onReroll(slot.key)} disabled={pinned} />
        <IconButton
          size="sm"
          variant="ghost"
          icon={pinned ? "●" : "○"}
          label={`${pinned ? "Unpin" : "Pin"} ${label}`}
          active={pinned}
          onClick={() => (pinned ? controls.onUnpin(slot.key) : controls.onPin(slot.key))}
        />
      </span>
    </li>
  );
}

function CharacterCard({
  character,
  controls,
  edits,
  onEdit,
  onLock,
}: {
  character: AgendaDraftCharacter;
  controls: AgendaSlotControls;
  edits: AgendaEdits;
  onEdit: (key: string, text: string | undefined) => void;
  onLock: (character: AgendaDraftCharacter) => void;
}) {
  return (
    <section className="agenda-card" aria-label={`${character.name} agenda drafts`} data-testid="agenda-character" data-character={character.name}>
      <header className="agenda-card__head">
        <div>
          <h3 className="agenda-card__name">{character.name}</h3>
          {character.title && (
            <p className="agenda-card__arc">
              <strong>{character.title}</strong>
              {character.summary ? <span className="cf-muted"> · {character.summary}</span> : null}
            </p>
          )}
        </div>
        <span className="app-row">
          {!character.inCampaign && <Badge tone="warning">not in the campaign</Badge>}
          {character.lock && (
            <Button size="sm" variant={character.lock.locked ? "primary" : "ghost"} active={character.lock.locked} onClick={() => onLock(character)} data-testid="agenda-lock-arc">
              {character.lock.locked ? "Arc locked" : "Lock arc"}
            </Button>
          )}
        </span>
      </header>
      <ul className="agenda-slots">
        {character.slots.map((s) => (
          <SlotRow key={s.key} slot={s} who={character.name} controls={controls} />
        ))}
      </ul>
      <ol className="agenda-acts">
        {character.acts.map((a) => {
          const key = editKey(character.id, a.act);
          const edited = edits[key] !== undefined;
          return (
            <li key={a.act} className="agenda-act" data-act={a.act}>
              <div className="agenda-act__head">
                <span className="agenda-act__label">Act {a.act} —</span>
                {a.hint && (
                  <span className="agenda-act__hint" title={a.hint.text}>
                    {a.hint.label}: {a.hint.text.replace(/^Earned if you /, "").replace(/\.$/, "")} <PageRef page={a.hint.page} />
                  </span>
                )}
                {edited && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(key, undefined)}>
                    Use the draft again
                  </Button>
                )}
              </div>
              <textarea
                className="cf-input agenda-act__text"
                aria-label={`${character.name}, Act ${a.act} agenda draft`}
                rows={Math.min(7, Math.max(3, Math.ceil((edits[key] ?? a.text).length / 62)))}
                value={edits[key] ?? a.text}
                onChange={(e) => onEdit(key, e.target.value)}
              />
              {edited && <p className="cf-muted agenda-act__note">Your text: re-rolls below no longer change it.</p>}
              <ul className="agenda-slots agenda-slots--act" aria-label={`Act ${a.act} slots`}>
                {a.slots.map((s) => (
                  <SlotRow key={s.key} slot={s} who={`${character.name}, Act ${a.act}`} controls={controls} chip />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The cards: one per character. */
export function AgendaDraftCards({
  drafts,
  controls,
  edits,
  onEdit,
  onLock,
}: {
  drafts: AgendaDraftSet;
  controls: AgendaSlotControls;
  edits: AgendaEdits;
  onEdit: (key: string, text: string | undefined) => void;
  onLock: (character: AgendaDraftCharacter) => void;
}) {
  return (
    <section className="agenda-drafts" aria-label="Agenda drafts" data-testid="agenda-drafts">
      <div className="agenda-drafts__banner">
        <Badge tone="warning">Draft</Badge>
        <span>{drafts.note ?? "Drafts: revise them to fit your story."}</span>
      </div>
      <div className="agenda-drafts__grid">
        {drafts.characters.map((c) => (
          <CharacterCard key={c.id} character={c} controls={controls} edits={edits} onEdit={onEdit} onLock={onLock} />
        ))}
      </div>
    </section>
  );
}

const TONE_ICON: Record<AgendaDraftReport["lines"][number]["tone"], string> = { ok: "✓", info: "·", warning: "!", danger: "✕" };

/** The conflict report. */
export function AgendaReportCard({ report }: { report: AgendaDraftReport }) {
  return (
    <Card title="Conflict check" subtitle={report.summary} className="agenda-report" data-testid="agenda-report" data-ok={report.ok ? "true" : "false"}>
      <ul className="agenda-report__lines">
        {report.lines.map((l, i) => (
          <li key={i} className={`agenda-report__line is-${l.tone}`}>
            <span aria-hidden="true">{TONE_ICON[l.tone]}</span> {l.text}
          </li>
        ))}
      </ul>
      {report.pairs && report.pairs.length > 0 && (
        <table className="cf-table agenda-report__pairs" aria-label="Conflict by pair">
          <thead>
            <tr>
              <th scope="col">Pair</th>
              <th scope="col">Score</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {report.pairs.map((p) => (
              <tr key={`${p.a}|${p.b}`} className={p.score === 0 ? "is-quiet" : undefined}>
                <td>
                  {p.a} ↔ {p.b}
                </td>
                <td className="cf-mono">{p.score}</td>
                <td>{p.reasons.length ? p.reasons.join("; ") : "nothing between them"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** The texts the accept writes: the GM's edits over the drafts, for characters in the campaign. */
export function agendaWrites(drafts: AgendaDraftSet, edits: AgendaEdits): AgendaWrite[] {
  return drafts.characters
    .filter((c) => c.inCampaign)
    .map((c) => ({ characterId: c.id, name: c.name, acts: c.acts.map((a) => ({ act: a.act, text: (edits[editKey(c.id, a.act)] ?? a.text).trim() })).filter((a) => a.text !== "") }));
}

/** Accept: asks before replacing agendas the GM wrote, then writes them. */
export function AgendaAccept({
  drafts,
  edits,
  graph,
  adventureId,
  run,
}: {
  drafts: AgendaDraftSet;
  edits: AgendaEdits;
  graph: GeneratedGraph;
  adventureId?: Id | undefined;
  run: { stepSeeds: Record<string, string>; pinned: Record<string, unknown>; partSeeds: Record<string, string>; pinnedParts: Record<string, unknown> };
}) {
  const ctx = useCampaign();
  const [busy, setBusy] = useState(false);
  const [overwrites, setOverwrites] = useState<AgendaOverwrite[] | undefined>();
  const [done, setDone] = useState<{ written: number; kept: number } | undefined>();
  const writes = agendaWrites(drafts, edits);
  const adventure = adventureId ? ctx.store.get("adventures", adventureId) : undefined;
  const skipped = drafts.characters.filter((c) => !c.inCampaign).length;

  const write = async (keepExisting: boolean) => {
    setOverwrites(undefined);
    setBusy(true);
    try {
      const res = await acceptAgendaDrafts(ctx, { adventureId: adventure?.id, field: drafts.field, writes, keepExisting, graph, ...run });
      setDone({ written: res.written, kept: res.kept });
      pushToast(`Wrote ${res.written} agenda${res.written === 1 ? "" : "s"}${res.kept ? `, kept ${res.kept} of yours` : ""}.`, { tone: "success" });
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    try {
      const found = await agendaOverwrites(ctx, { adventureId: adventure?.id, field: drafts.field, writes });
      setBusy(false);
      if (found.length > 0) setOverwrites(found);
      else await write(false);
    } catch (e) {
      setBusy(false);
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    }
  };

  return (
    <div className="app-stack agenda-accept">
      <p className="cf-muted">
        Writes each character&apos;s agendas{adventure ? ` and the ${adventure.title || "adventure"} agenda cards` : ""}. Nothing you wrote is replaced without asking.
        {skipped > 0 ? ` ${skipped} placeholder character${skipped === 1 ? " is" : "s are"} not in the campaign and ${skipped === 1 ? "is" : "are"} skipped.` : ""}
      </p>
      <Button variant="primary" size="lg" disabled={busy || writes.length === 0} onClick={() => void start()} data-testid="agenda-accept">
        {done ? "Accept again" : "Accept agendas"}
      </Button>
      {done && (
        <p className="app-note" data-testid="agenda-accepted">
          Wrote {done.written} agenda{done.written === 1 ? "" : "s"}
          {done.kept ? `, kept ${done.kept} of yours` : ""}.{" "}
          {adventure && (
            <Link
              to="/c/$campaignId/adventures/$adventureId"
              params={{ campaignId: ctx.campaignId, adventureId: adventure.id }}
              search={{ view: "agendas" }}
              className="app-link-strong"
              data-testid="agenda-cards-open"
            >
              Open the agenda cards
            </Link>
          )}
        </p>
      )}
      <Dialog
        open={overwrites !== undefined}
        onClose={() => setOverwrites(undefined)}
        title={`Replace ${overwrites?.length ?? 0} agenda${overwrites?.length === 1 ? "" : "s"} you wrote?`}
        className="agenda-overwrite"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverwrites(undefined)}>
              Cancel
            </Button>
            <Button onClick={() => void write(true)} data-testid="agenda-keep-mine">
              Fill only the empty ones
            </Button>
            <Button variant="danger" onClick={() => void write(false)} data-testid="agenda-replace">
              Replace them
            </Button>
          </>
        }
      >
        <div data-testid="agenda-overwrite">
          <p>These agendas already have text that differs from the drafts:</p>
          <ul className="agenda-overwrite__list">
            {(overwrites ?? []).map((o, i) => (
              <li key={i}>
                <strong>
                  {o.name}, Act {o.act}
                </strong>{" "}
                <span className="cf-muted">({o.where === "sheet" ? "character sheet" : "agenda card"})</span>: {o.current.length > 140 ? `${o.current.slice(0, 139)}…` : o.current}
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </div>
  );
}
