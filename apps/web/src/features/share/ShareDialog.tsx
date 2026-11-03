/**
 * "Share with players": a preview of the player-safe share of a session and
 * the options for it (images for phones, a PDF packet or one web page, what
 * to include, only what is new), then the system share sheet or a download.
 * A second mode, "Player packets", makes each player their own copy (see
 * PacketsBody). Loaded on demand from table mode, the session page and the
 * primer.
 */
import {
  defaultShareOptions,
  planShare,
  playerMembers,
  playerShareSnapshot,
  recordShare,
  shareBaseline,
  shareMessage,
  shareRecordOf,
  type Id,
  type PlayerShare,
  type ShareOptions,
} from "@campaign-forge/core";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, Tabs, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { usePaper } from "../../lib/paper";
import { useCampaign, useMapVersion, useMeta } from "../../state/hooks";
import { logTable } from "../../state/tableActions";
import { PacketsBody } from "./PacketsBody";
import { primerShareSections } from "./primerShare";
import { crewNotesShareSections } from "./crewNotesShare";
import { recapShareSections } from "./recapShare";
import { arcsDefOf, crewNotesFor } from "../../state/arcActions";
import { playerRecapFor } from "../../state/recapActions";
import { buildShareFiles, canShareFiles, loadShareImages, sendFiles, shareFileStem, type LoadedImages } from "./shareExport";
import { shareSections, shareTime, shareTitle, type ShareFormat, type ShareSection } from "./shareLayout";
import { FormatFieldset, SharePreview, loadShareDocs, usePassable, type ShareCtx } from "./SharePreview";
import "./share.css";

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: Id;
  /** The scene the table is on: its briefing and map. */
  sceneId?: Id | undefined;
  /**
   * Offer the campaign primer: `defaultOn` ticks it, `only` starts with the
   * session's own items unticked (the primer page and session 0). Without it
   * the primer is still offered, unticked, when it has text.
   */
  primer?: { defaultOn?: boolean; only?: boolean } | undefined;
  /** Open on the player packets. */
  packets?: boolean;
}

/** The share of a session as it stands now (the player projection), with its bodies loaded. */
export async function sessionShare(ctx: ShareCtx, sessionId: Id, sceneId: Id | undefined, at: string): Promise<PlayerShare> {
  await loadShareDocs(ctx, sceneId);
  return playerShareSnapshot({
    maps: ctx.store.toJSON(),
    module: ctx.module.module,
    sessionId,
    sceneId,
    doc: (id) => ctx.registry.peek(id),
    at,
    referenceName: (ref, id) => ctx.module.referenceItem(ref, id)?.name,
  });
}

const INCLUDE: Array<{ key: keyof Omit<ShareOptions, "onlyNew">; label: string }> = [
  { key: "briefing", label: "Scene briefing" },
  { key: "maps", label: "Map" },
  { key: "handouts", label: "Handouts" },
  { key: "party", label: "Party card" },
];

export function ShareDialog({ open, onClose, sessionId, sceneId, primer, packets }: ShareDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Share with players" className="app-share">
      {open && <ShareModes onClose={onClose} sessionId={sessionId} sceneId={sceneId} primer={primer} packets={packets} />}
    </Dialog>
  );
}

function ShareModes(props: Omit<ShareDialogProps, "open">) {
  const meta = useMeta();
  const players = playerMembers(meta);
  const [mode, setMode] = useState<string>(props.packets ? "packets" : "group");
  return (
    <Tabs
      className="app-share__modes"
      value={mode}
      onChange={setMode}
      tabs={[
        { id: "group", label: "Everyone", content: mode === "group" ? <ShareBody {...props} /> : null },
        {
          id: "packets",
          label: `Player packets${players.length ? ` (${players.length})` : ""}`,
          content: mode === "packets" ? <PacketsBody onClose={props.onClose} sessionId={props.sessionId} sceneId={props.sceneId} primer={props.primer} /> : null,
        },
      ]}
    />
  );
}

function ShareBody({ onClose, sessionId, sceneId, primer }: Omit<ShareDialogProps, "open">) {
  const ctx = useCampaign();
  const version = useMapVersion("*");
  const docsVersion = useMapVersion("docs");
  const [paper, setPaper] = usePaper();
  const [format, setFormat] = useState<ShareFormat>("images");
  const sessions = useMemo(() => ctx.store.list("sessions"), [ctx.store, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => shareBaseline(sessions), [sessions]);
  const [opts, setOpts] = useState<ShareOptions>(() => (primer?.only ? { ...defaultShareOptions(baseline), briefing: false, maps: false, handouts: false, party: false } : defaultShareOptions(baseline)));
  const [withPrimer, setWithPrimer] = useState(primer?.defaultOn ?? false);
  const [primerSections, setPrimerSections] = useState<ShareSection[] | undefined>();
  const [withNotes, setWithNotes] = useState(false);
  const [withRecap, setWithRecap] = useState(false);
  // the session's "Previously on…" read-aloud, player-safe (offered when the session has one)
  const recap = useMemo(() => playerRecapFor(ctx, sessionId), [ctx, sessionId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const arcsDef = arcsDefOf(ctx.module, ctx.store.meta().mode);
  // the whole crew's notes (nothing a single player learnt alone)
  const notes = useMemo(() => (arcsDef ? crewNotesFor(ctx) : undefined), [ctx, arcsDef, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [at] = useState(() => new Date().toISOString());
  const [snapshot, setSnapshot] = useState<PlayerShare | undefined>();
  const [images, setImages] = useState<LoadedImages>({ ready: new Map(), originals: new Map() });
  const [error, setError] = useState<string | undefined>();
  const [files, setFiles] = useState<File[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // the share as it stands (recomputed when the campaign changes)
  useEffect(() => {
    let alive = true;
    primerShareSections(ctx).then(
      (p) => alive && setPrimerSections(p),
      () => alive && setPrimerSections([]),
    );
    sessionShare(ctx, sessionId, sceneId, at).then(
      async (s) => {
        if (!alive) return;
        setSnapshot(s);
        const loaded = await loadShareImages(ctx.assets, s);
        if (alive) setImages(loaded);
      },
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [ctx, sessionId, sceneId, at, version, docsVersion]);

  const plan = useMemo(() => (snapshot ? planShare(snapshot, baseline, opts) : undefined), [snapshot, baseline, opts]);
  const primerOn = withPrimer && !!primerSections?.length;
  const notesOn = withNotes && !!notes && !notes.empty;
  const recapOn = withRecap && !!recap;
  const passable = usePassable(ctx, version);
  const sections = useMemo(() => {
    if (!plan) return [];
    const updatedMaps = new Set(Object.entries(plan.mapStatus).filter(([, s]) => s === "updated").map(([id]) => id));
    // the primer comes first: it introduces the campaign, and "only what's new" never filters it; then the recap of last time; the crew notes go last, as they stand
    const primerPart = primerOn ? primerSections! : [];
    return [...primerPart, ...(recapOn ? recapShareSections(recap) : []), ...shareSections({ share: plan.share, images: images.ready, format, updatedMaps }), ...(notesOn ? crewNotesShareSections(notes) : [])];
  }, [plan, images, format, primerOn, primerSections, recapOn, recap, notesOn, notes]);
  const empty = sections.length === 0;
  const message = plan ? shareMessage(plan, { primer: primerOn, crewNotes: notesOn, recap: recapOn }) : "";

  // build the files ahead of the click: the share sheet needs the click's user activation, which a slow build would lose
  useEffect(() => {
    setFiles(undefined);
    if (!plan || empty) return;
    let alive = true;
    buildShareFiles({ share: plan.share, sections, images, format, paper, passable }).then(
      (f) => alive && setFiles(f),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [plan, sections, images, format, paper, passable, empty]);

  const canShare = files ? canShareFiles(files) : typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const title = snapshot ? shareTitle(snapshot) : "Player share";

  const send = async () => {
    if (!plan || !files || !snapshot) return;
    setBusy(true);
    try {
      const result = await sendFiles(files, { title, text: message, zipName: `${shareFileStem(snapshot)}.zip` });
      if (result === "cancelled") return;
      recordShare(ctx.store, sessionId, shareRecordOf(plan, { format, primer: primerOn, crewNotes: notesOn, recap: recapOn }));
      logTable(ctx, sessionId, `Shared with players: ${message}`);
      pushToast(result === "shared" ? "Shared. Next time only what is new goes out." : `Saved ${files.length === 1 ? files[0]!.name : `${files.length} files as a zip`}. Send it to the group chat.`, { tone: "success" });
      onClose();
    } catch (e) {
      pushToast(`Share failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      const el = document.querySelector<HTMLTextAreaElement>("[data-testid=share-message]");
      el?.select();
      setCopied(false);
    }
  };

  const toggle = (key: keyof ShareOptions) => setOpts((o) => ({ ...o, [key]: !o[key] }));
  const available: Record<(typeof INCLUDE)[number]["key"], number> = {
    briefing: snapshot?.briefing ? 1 : 0,
    maps: snapshot?.maps.length ?? 0,
    handouts: snapshot?.handouts.length ?? 0,
    party: snapshot?.party.length ?? 0,
  };

  return (
    <div className="app-share__body" data-testid="share-dialog">
      <p className="cf-muted app-share__safety">
        Only what every player may see: GM notes, hidden map areas, unrevealed handouts, handouts for one player and GM-only fields are never included. Nothing leaves this device until you share or save the files.
      </p>
      <div className="app-share__options">
        <FormatFieldset format={format} setFormat={setFormat} paper={paper} setPaper={setPaper} name="share-format" />
        <fieldset className="app-fieldset">
          <legend className="app-label">What to include</legend>
          {(primer || !!primerSections?.length) && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={primerOn} disabled={!primerSections?.length} onChange={() => setWithPrimer((v) => !v)} data-testid="share-include-primer" />
              Campaign primer
              {primerSections && primerSections.length === 0 ? <span className="cf-muted"> (empty)</span> : primerSections ? <span className="cf-muted"> ({primerSections.length} sections)</span> : null}
            </label>
          )}
          {recap && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={recapOn} onChange={() => setWithRecap((v) => !v)} data-testid="share-include-recap" />
              Previously on… <span className="cf-muted">(the read-aloud)</span>
            </label>
          )}
          {INCLUDE.map(({ key, label }) => (
            <label key={key} className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={opts[key]} disabled={available[key] === 0} onChange={() => toggle(key)} data-testid={`share-include-${key}`} />
              {label}
              {available[key] === 0 ? <span className="cf-muted"> (none)</span> : key === "handouts" ? <span className="cf-muted"> ({available[key]})</span> : null}
            </label>
          ))}
          {arcsDef && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={notesOn} disabled={!notes || notes.empty} onChange={() => setWithNotes((v) => !v)} data-testid="share-include-crew-notes" />
              {notes?.title ?? "Crew notes"}
              {!notes || notes.empty ? <span className="cf-muted"> (nothing found yet)</span> : <span className="cf-muted"> ({notes.threads.length} threads, {notes.contacts.length} contacts)</span>}
            </label>
          )}
          <label className="app-toggle">
            <input type="checkbox" className="cf-checkbox" checked={opts.onlyNew} onChange={() => toggle("onlyNew")} data-testid="share-only-new" />
            Only what's new since the last share
            {baseline.last && <span className="cf-muted"> ({shareTime(baseline.last.at)})</span>}
          </label>
        </fieldset>
      </div>

      {error && (
        <p className="cf-field__error" role="alert">
          {error}
        </p>
      )}
      <SharePreview sections={sections} format={format} paper={paper} snapshot={plan?.share} images={images} passable={passable} />
      {plan && empty && (
        <p className="app-share__empty" data-testid="share-empty">
          {opts.onlyNew && baseline.count > 0 ? "Nothing new since the last share. Untick “Only what's new” to send everything again." : "Nothing to share yet: reveal a handout or part of the map first."}
        </p>
      )}

      <label className="app-label">
        Message for the chat
        <textarea className="cf-input app-share__message" readOnly rows={2} value={message} data-testid="share-message" />
      </label>
      <div className="app-row app-share__actions">
        <Button variant="ghost" onClick={() => void copy()} data-testid="share-copy" disabled={!message}>
          {copied ? "Copied" : "Copy message"}
        </Button>
        <span className="app-grow" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void send()} disabled={!files || empty || busy} data-testid="share-send">
          {!files && !empty ? "Preparing…" : canShare ? "Share…" : files && files.length > 1 ? "Download zip" : "Download"}
        </Button>
      </div>
    </div>
  );
}
