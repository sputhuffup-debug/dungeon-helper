/**
 * Player packets: each player's own copy of the share, to send to them alone
 * (a direct message) before the session. A packet is built through that
 * player's projection only (`playerPacketSnapshot`): what every player may
 * see, what the GM shared with that player, and their own characters' sheets
 * and agendas. The preview shows exactly the file a player gets; every
 * player's file can go out at once as a zip.
 */
import {
  DEFAULT_PACKET_OPTIONS,
  SHARE_VIEWER,
  canSee,
  charactersOfMember,
  memberViewer,
  packetBaseline,
  packetChanges,
  packetMessage,
  planPacket,
  playerMembers,
  playerPacketSnapshot,
  recordShare,
  shareRecordOf,
  type Handout,
  type Id,
  type PacketOptions,
  type PacketPlan,
  type PlayerPacket,
  type ShareBaseline,
} from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GiveToPlayer } from "../../components/GiveToPlayer";
import { VisibilitySelect } from "../../components/VisibilitySelect";
import { Badge, Button, EmptyState, pushToast } from "../../components/ui";
import { downloadFile, slug } from "../../lib/download";
import { errorMessage } from "../../lib/format";
import { usePaper } from "../../lib/paper";
import { useCampaign, useMapVersion, useMeta } from "../../state/hooks";
import { updateHandout } from "../../state/prepActions";
import { logTable } from "../../state/tableActions";
import { primerShareSections } from "./primerShare";
import { crewNotesShareSections } from "./crewNotesShare";
import { arcsDefOf, crewNotesFor } from "../../state/arcActions";
import { buildShareFiles, canShareFiles, loadShareImages, packetsZip, sendFiles, shareFileStem, type LoadedImages } from "./shareExport";
import { packetSections, shareTime, shareTitle, type ReadyImage, type ShareFormat, type ShareSection } from "./shareLayout";
import { FormatFieldset, SharePreview, loadShareDocs, usePassable, type ShareCtx } from "./SharePreview";

const EMPTY_IMAGES: LoadedImages = { ready: new Map(), originals: new Map() };

const INCLUDE: Array<{ key: keyof Omit<PacketOptions, "onlyNew">; label: string }> = [
  { key: "sheets", label: "Their character sheet and agenda" },
  { key: "briefing", label: "Scene briefing" },
  { key: "maps", label: "Map" },
  { key: "handouts", label: "Handouts" },
  { key: "party", label: "Party card" },
];

/** Every player's packet for a session as it stands now, each through that player's projection, with the bodies it reads loaded. */
export async function sessionPackets(ctx: ShareCtx, sessionId: Id, sceneId: Id | undefined, at: string): Promise<PlayerPacket[]> {
  const before = ctx.store.toJSON();
  const players = playerMembers(before.meta);
  await loadShareDocs(
    ctx,
    sceneId,
    players.map((p) => memberViewer(before, p.id)),
  );
  const maps = ctx.store.toJSON();
  return players.map((p) =>
    playerPacketSnapshot({
      maps,
      module: ctx.module.module,
      memberId: p.id,
      sessionId,
      sceneId,
      doc: (id) => ctx.registry.peek(id),
      at,
      referenceName: (ref, id) => ctx.module.referenceItem(ref, id)?.name,
    }),
  );
}

interface PlayerPlan {
  packet: PlayerPacket;
  plan: PacketPlan;
  baseline: ShareBaseline;
}

export function PacketsBody({ onClose, sessionId, sceneId, primer }: { onClose: () => void; sessionId: Id; sceneId?: Id | undefined; primer?: { defaultOn?: boolean } | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const players = useMemo(() => playerMembers(meta), [meta]);
  const version = useMapVersion("*");
  const docsVersion = useMapVersion("docs");
  const [paper, setPaper] = usePaper();
  const [format, setFormat] = useState<ShareFormat>("page");
  const [opts, setOpts] = useState<PacketOptions>(DEFAULT_PACKET_OPTIONS);
  const [withPrimer, setWithPrimer] = useState(primer?.defaultOn ?? false);
  const [primerSections, setPrimerSections] = useState<ShareSection[] | undefined>();
  const [withNotes, setWithNotes] = useState(false);
  const arcsDef = arcsDefOf(ctx.module, meta.mode);
  const [at] = useState(() => new Date().toISOString());
  const [packets, setPackets] = useState<PlayerPacket[] | undefined>();
  const [images, setImages] = useState<LoadedImages>(EMPTY_IMAGES);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<Id | undefined>();
  const [files, setFiles] = useState<File[] | undefined>();
  const [busy, setBusy] = useState(false);
  const sessions = useMemo(() => ctx.store.list("sessions"), [ctx.store, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const passable = usePassable(ctx, version);

  // every player's packet as it stands, each through that player's projection
  useEffect(() => {
    let alive = true;
    primerShareSections(ctx).then(
      (p) => alive && setPrimerSections(p),
      () => alive && setPrimerSections([]),
    );
    (async () => {
      const list = await sessionPackets(ctx, sessionId, sceneId, at);
      if (!alive) return;
      setPackets(list);
      const ready = new Map<string, ReadyImage>();
      const originals = new Map<string, Blob>();
      for (const p of list) {
        const l = await loadShareImages(ctx.assets, p);
        for (const [k, v] of l.ready) ready.set(k, v);
        for (const [k, v] of l.originals) originals.set(k, v);
      }
      if (alive) setImages({ ready, originals });
    })().catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [ctx, players, sessionId, sceneId, at, version, docsVersion]);

  const primerOn = withPrimer && !!primerSections?.length;
  // each player's own crew notes: what the crew knows plus what they learnt alone
  const notesByPlayer = useMemo(() => new Map(arcsDef ? players.map((p) => [p.id, crewNotesFor(ctx, p.id)] as const) : []), [ctx, arcsDef, players, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const notesOn = withNotes && [...notesByPlayer.values()].some((n) => !n.empty);
  const plans = useMemo(() => {
    const out = new Map<Id, PlayerPlan>();
    for (const packet of packets ?? []) {
      const baseline = packetBaseline(sessions, packet.member.id);
      out.set(packet.member.id, { packet, baseline, plan: planPacket(packet, baseline, opts) });
    }
    return out;
  }, [packets, sessions, opts]);
  const sectionsOf = useMemo(
    () => (p: PlayerPlan | undefined) => {
      if (!p) return [];
      const updatedMaps = new Set(Object.entries(p.plan.mapStatus).filter(([, s]) => s === "updated").map(([id]) => id));
      const notes = notesOn ? crewNotesShareSections(notesByPlayer.get(p.packet.member.id)) : [];
      return [...(primerOn ? primerSections! : []), ...packetSections({ share: p.plan.share, images: images.ready, format, updatedMaps }), ...notes];
    },
    [primerOn, primerSections, images, format, notesOn, notesByPlayer],
  );

  const selected = players.find((p) => p.id === selectedId) ?? players[0];
  const current = selected ? plans.get(selected.id) : undefined;
  const sections = useMemo(() => sectionsOf(current), [sectionsOf, current]);
  const empty = sections.length === 0;
  const currentNotes = notesOn && selected ? !notesByPlayer.get(selected.id)?.empty : false;
  const message = current ? packetMessage(current.plan, { primer: primerOn, crewNotes: currentNotes }) : "";

  // the selected player's files, built ahead of the click (the share sheet needs the click's user activation)
  useEffect(() => {
    setFiles(undefined);
    if (!current || empty) return;
    let alive = true;
    buildShareFiles({ share: current.plan.share, sections, images, format, paper, passable }).then(
      (f) => alive && setFiles(f),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [current, sections, images, format, paper, passable, empty]);

  const record = (p: PlayerPlan) => recordShare(ctx.store, sessionId, shareRecordOf(p.plan, { format, primer: primerOn, crewNotes: notesOn && !notesByPlayer.get(p.packet.member.id)?.empty, member: p.packet.member.id }));

  const sendSelected = async () => {
    if (!current || !files) return;
    setBusy(true);
    try {
      const result = await sendFiles(files, { title: shareTitle(current.plan.share), text: message, zipName: `${shareFileStem(current.plan.share)}.zip` });
      if (result === "cancelled") return;
      record(current);
      logTable(ctx, sessionId, `Player packet: ${message}`);
      pushToast(result === "shared" ? `Shared ${current.packet.for}'s packet.` : `Saved ${files.length === 1 ? files[0]!.name : `${files.length} files as a zip`}. Send it to ${current.packet.for} alone.`, { tone: "success" });
    } catch (e) {
      pushToast(`Share failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const out: Array<{ p: PlayerPlan; files: File[] }> = [];
      for (const player of players) {
        const p = plans.get(player.id);
        const s = sectionsOf(p);
        if (!p || s.length === 0) continue;
        out.push({ p, files: await buildShareFiles({ share: p.plan.share, sections: s, images, format, paper, passable }) });
      }
      if (out.length === 0) return;
      const first = out[0]!.p.plan.share;
      const zip = await packetsZip(
        out.map((x) => ({ share: x.p.plan.share, files: x.files })),
        `${slug(first.campaign)}-session-${first.session.number}-player-packets.zip`,
      );
      downloadFile(zip, zip.name, zip.type);
      for (const x of out) record(x.p);
      logTable(ctx, sessionId, `Player packets for ${out.map((x) => x.p.packet.for).join(", ")}`);
      pushToast(`Saved ${zip.name}: one packet per player. Send each player only their own.`, { tone: "success", timeout: 8000 });
    } catch (e) {
      pushToast(`Export failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: keyof PacketOptions) => setOpts((o) => ({ ...o, [key]: !o[key] }));
  const canShare = files ? canShareFiles(files) : false;

  if (players.length === 0) {
    return (
      <div className="app-share__body" data-testid="packets-dialog">
        <EmptyState
          title="No players yet"
          text="Add the people at your table in Settings, with the PCs they play. Then each gets their own packet: what every player sees, what you share with them alone, and their own sheet and agenda."
          action={
            <Link to="/c/$campaignId/settings" params={{ campaignId: ctx.campaignId }} className="cf-btn" onClick={onClose}>
              Add players…
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="app-share__body" data-testid="packets-dialog">
      <p className="cf-muted app-share__safety">
        One packet per player, for them alone: what every player may see, what you shared with them, and their own character&apos;s sheet and agenda. Never GM-only material or what another player has alone. Nothing leaves this device until you share or save the files.
      </p>
      <div className="app-share__options">
        <FormatFieldset format={format} setFormat={setFormat} paper={paper} setPaper={setPaper} name="packet-format" />
        <fieldset className="app-fieldset">
          <legend className="app-label">What to include</legend>
          {!!primerSections?.length && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={primerOn} onChange={() => setWithPrimer((v) => !v)} data-testid="packet-include-primer" />
              Campaign primer <span className="cf-muted">({primerSections.length} sections)</span>
            </label>
          )}
          {INCLUDE.map(({ key, label }) => (
            <label key={key} className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={opts[key]} onChange={() => toggle(key)} data-testid={`packet-include-${key}`} />
              {label}
            </label>
          ))}
          {arcsDef && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={notesOn} disabled={![...notesByPlayer.values()].some((n) => !n.empty)} onChange={() => setWithNotes((v) => !v)} data-testid="packet-include-crew-notes" />
              Crew notes <span className="cf-muted">(each player's own)</span>
            </label>
          )}
          <label className="app-toggle">
            <input type="checkbox" className="cf-checkbox" checked={opts.onlyNew} onChange={() => toggle("onlyNew")} data-testid="packet-only-new" />
            Only what&apos;s new since each player&apos;s last packet
          </label>
        </fieldset>
      </div>

      <ul className="app-packets" aria-label="Players">
        {players.map((p) => {
          const pp = plans.get(p.id);
          const chars = charactersOfMember(ctx.store.toJSON(), p.id).map((id) => ctx.store.get("entities", id)?.name ?? "");
          const changes = pp ? packetChanges(pp.plan, pp.baseline) : undefined;
          const isSel = p.id === selected?.id;
          const s = pp?.plan.share;
          const personal = s?.handouts.filter((h) => h.personal).length ?? 0;
          return (
            <li key={p.id} className={`app-packets__player${isSel ? " is-selected" : ""}`} data-testid="packet-player" data-player={p.name}>
              <button type="button" className="app-packets__pick" aria-pressed={isSel} onClick={() => setSelectedId(p.id)} aria-label={`Preview ${p.name}'s packet`}>
                <strong>{p.name}</strong>
                <span className="cf-muted">{chars.length ? `plays ${chars.join(", ")}` : "no PC yet"}</span>
              </button>
              <span className="app-packets__facts">
                {s && s.characters.length > 0 && <Badge tone="accent">{s.characters.length === 1 ? "sheet" : `${s.characters.length} sheets`}</Badge>}
                {s && s.characters.some((c) => c.agenda) && <Badge tone="accent">agenda</Badge>}
                {s && <Badge>{s.handouts.length} handouts</Badge>}
                {personal > 0 && <Badge tone="warning">{personal} just for {p.name}</Badge>}
              </span>
              <span className="cf-muted app-packets__changes" data-testid="packet-changes">
                {!pp ? "Preparing…" : pp.baseline.last ? `Since ${shareTime(pp.baseline.last.at)}: ${changes}` : "First packet"}
              </span>
            </li>
          );
        })}
      </ul>

      <HandoutSharing />

      {error && (
        <p className="cf-field__error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <h3 className="app-packets__title" data-testid="packet-title">
          {current ? shareTitle(current.plan.share) : `Packet for ${selected.name}`}
        </h3>
      )}
      <SharePreview sections={sections} format={format} paper={paper} snapshot={current?.plan.share} images={images} passable={passable} />
      {current && empty && (
        <p className="app-share__empty" data-testid="share-empty">
          {opts.onlyNew && current.baseline.count > 0 ? `Nothing new for ${selected?.name} since their last packet.` : `Nothing for ${selected?.name} yet.`}
        </p>
      )}

      <label className="app-label">
        Message for {selected?.name ?? "the player"}
        <textarea className="cf-input app-share__message" readOnly rows={2} value={message} data-testid="packet-message" />
      </label>
      <div className="app-row app-share__actions">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <span className="app-grow" />
        <Button onClick={() => void exportAll()} disabled={!packets || busy} data-testid="packets-export-all">
          All players as zip
        </Button>
        <Button variant="primary" onClick={() => void sendSelected()} disabled={!files || empty || busy} data-testid="packet-send">
          {!files && !empty ? "Preparing…" : canShare ? `Share ${selected?.name}'s packet…` : `Download ${selected?.name}'s packet`}
        </Button>
      </div>
    </div>
  );
}

/** Handouts not every player sees: share one with chosen players, or give a character's handout to its player. */
function HandoutSharing() {
  const ctx = useCampaign();
  const meta = useMeta();
  const players = playerMembers(meta);
  const version = useMapVersion("handouts");
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handouts = useMemo(() => {
    const rank = (h: Handout) => (h.visibility.level === "some_players" ? 0 : h.toOwner ? 1 : h.character ? 2 : 3);
    return ctx.store
      .list("handouts")
      .filter((h) => !canSee(h.visibility, SHARE_VIEWER))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }, [ctx.store, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const characterName = (id: Id | undefined) => (id ? ctx.store.get("entities", id)?.name : undefined);
  return (
    <details className="app-packets__handouts" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="packet-handouts">
      <summary>Share a handout with one player ({handouts.length} not shared with everyone)</summary>
      {open && (
        <ul className="app-list">
          {handouts.length === 0 && <li className="cf-muted">Every handout is visible to all players.</li>}
          {handouts.map((h) => (
            <li key={h.id} className="app-list__row" data-testid="packet-handout" data-handout={h.title}>
              <span className="app-grow">
                {h.title}
                {characterName(h.character) && <span className="cf-muted"> · for {characterName(h.character)}</span>}
              </span>
              <Badge>{h.kind}</Badge>
              <VisibilitySelect label={`${h.title} visibility`} value={h.visibility} players={players} onChange={(v) => updateHandout(ctx, h.id, { visibility: v })} />
              <GiveToPlayer handout={h} />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
