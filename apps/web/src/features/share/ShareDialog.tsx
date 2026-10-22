/**
 * "Share with players": a preview of the player-safe share of a session and
 * the options for it (images for phones or a PDF packet, what to include,
 * only what is new), then the system share sheet or a download. Loaded on
 * demand from table mode and the session page.
 */
import {
  SHARE_VIEWER,
  canSee,
  defaultShareOptions,
  generatorFor,
  planShare,
  playerShareSnapshot,
  recordShare,
  shareBaseline,
  shareMessage,
  shareRecordOf,
  type Id,
  type PlayerShare,
  type ShareOptions,
} from "@campaign-forge/core";
import type { MapGeneratorDef } from "@campaign-forge/module-sdk";
import { nodeToString } from "@campaign-forge/ui";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { PAPER_LABELS, usePaper, type Paper } from "../../lib/paper";
import { useCampaign, useMapVersion } from "../../state/hooks";
import type { CampaignContextValue } from "../../state/CampaignProvider";
import { logTable } from "../../state/tableActions";
import { primerShareSections } from "./primerShare";
import { buildShareFiles, canShareFiles, cardPreviewUrl, loadShareImages, sendFiles, type LoadedImages } from "./shareExport";
import { packetPages, phoneCards, shareSections, shareTime, type ShareSection } from "./shareLayout";
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
}

type ShareCtx = Pick<CampaignContextValue, "store" | "registry" | "whenDocSynced" | "module">;

/** Open and load the bodies a share reads: the scene's read-aloud, the adventure's player intro and visible handouts. */
async function loadShareDocs(ctx: ShareCtx, sceneId: Id | undefined): Promise<void> {
  const ids: Array<Id | undefined> = [];
  const scene = sceneId ? ctx.store.get("scenes", sceneId) : undefined;
  if (scene) {
    ids.push(scene.readAloudDoc);
    const act = scene.act ? ctx.store.get("acts", scene.act) : undefined;
    const adventure = act ? ctx.store.get("adventures", act.adventure) : undefined;
    ids.push(adventure?.playerIntroDoc);
  }
  for (const h of ctx.store.list("handouts")) if (canSee(h.visibility, SHARE_VIEWER)) ids.push(h.bodyDoc);
  await Promise.all(
    [...new Set(ids.filter((x): x is Id => !!x))].map((id) => {
      ctx.registry.open(id);
      return ctx.whenDocSynced(id).catch(() => undefined);
    }),
  );
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

export function ShareDialog({ open, onClose, sessionId, sceneId, primer }: ShareDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Share with players" className="app-share">
      {open && <ShareBody onClose={onClose} sessionId={sessionId} sceneId={sceneId} primer={primer} />}
    </Dialog>
  );
}

function ShareBody({ onClose, sessionId, sceneId, primer }: Omit<ShareDialogProps, "open">) {
  const ctx = useCampaign();
  const version = useMapVersion("*");
  const docsVersion = useMapVersion("docs");
  const [paper, setPaper] = usePaper();
  const [format, setFormat] = useState<"images" | "pdf">("images");
  const sessions = useMemo(() => ctx.store.list("sessions"), [ctx.store, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => shareBaseline(sessions), [sessions]);
  const [opts, setOpts] = useState<ShareOptions>(() => (primer?.only ? { ...defaultShareOptions(baseline), briefing: false, maps: false, handouts: false, party: false } : defaultShareOptions(baseline)));
  const [withPrimer, setWithPrimer] = useState(primer?.defaultOn ?? false);
  const [primerSections, setPrimerSections] = useState<ShareSection[] | undefined>();
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
  const passable = useMemo(() => {
    const byId = new Map(ctx.store.list("maps").map((m) => [m.id, generatorFor(m, ctx.module.module)?.passable] as const));
    return (id: string) => byId.get(id);
  }, [ctx, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(() => {
    if (!plan) return [];
    const updatedMaps = new Set(Object.entries(plan.mapStatus).filter(([, s]) => s === "updated").map(([id]) => id));
    // the primer comes first: it introduces the campaign, and "only what's new" never filters it
    const primerPart = primerOn ? primerSections! : [];
    return [...primerPart, ...shareSections({ share: plan.share, images: images.ready, format, updatedMaps })];
  }, [plan, images, format, primerOn, primerSections]);
  const empty = sections.length === 0;
  const message = plan ? shareMessage(plan, { primer: primerOn }) : "";

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
  const title = snapshot ? `${snapshot.campaign}: ${snapshot.session.label}` : "Player share";

  const send = async () => {
    if (!plan || !files || !snapshot) return;
    setBusy(true);
    try {
      const result = await sendFiles(files, { title, text: message, zipName: `${slugName(snapshot)}.zip` });
      if (result === "cancelled") return;
      recordShare(ctx.store, sessionId, shareRecordOf(plan, { format, primer: primerOn }));
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
        Only what the players may see: GM notes, hidden map areas, unrevealed handouts and GM-only fields are never included. Nothing leaves this device until you share or save the files.
      </p>
      <div className="app-share__options">
        <fieldset className="app-fieldset">
          <legend className="app-label">Send as</legend>
          <label className="app-toggle">
            <input type="radio" name="share-format" checked={format === "images"} onChange={() => setFormat("images")} data-testid="share-format-images" />
            Images for phones
          </label>
          <label className="app-toggle">
            <input type="radio" name="share-format" checked={format === "pdf"} onChange={() => setFormat("pdf")} data-testid="share-format-pdf" />
            PDF packet
          </label>
          {format === "pdf" && (
            <label className="app-toggle">
              Paper
              <select className="cf-select" value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="Paper" data-testid="share-paper">
                {(Object.keys(PAPER_LABELS) as Paper[]).map((p) => (
                  <option key={p} value={p}>
                    {PAPER_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <fieldset className="app-fieldset">
          <legend className="app-label">What to include</legend>
          {(primer || !!primerSections?.length) && (
            <label className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={primerOn} disabled={!primerSections?.length} onChange={() => setWithPrimer((v) => !v)} data-testid="share-include-primer" />
              Campaign primer
              {primerSections && primerSections.length === 0 ? <span className="cf-muted"> (empty)</span> : primerSections ? <span className="cf-muted"> ({primerSections.length} sections)</span> : null}
            </label>
          )}
          {INCLUDE.map(({ key, label }) => (
            <label key={key} className="app-toggle">
              <input type="checkbox" className="cf-checkbox" checked={opts[key]} disabled={available[key] === 0} onChange={() => toggle(key)} data-testid={`share-include-${key}`} />
              {label}
              {available[key] === 0 ? <span className="cf-muted"> (none)</span> : key === "handouts" ? <span className="cf-muted"> ({available[key]})</span> : null}
            </label>
          ))}
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

function slugName(s: PlayerShare): string {
  const base = s.campaign
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base || "campaign"}-session-${s.session.number}`;
}

function SharePreview({
  sections,
  format,
  paper,
  snapshot,
  images,
  passable,
}: {
  sections: ShareSection[];
  format: "images" | "pdf";
  paper: Paper;
  snapshot: PlayerShare | undefined;
  images: LoadedImages;
  passable: (id: string) => MapGeneratorDef["passable"] | undefined;
}) {
  const items = useMemo(() => {
    if (!snapshot || sections.length === 0) return [];
    if (format === "pdf") {
      const { pages, text } = packetPages(sections, snapshot, paper, { passable });
      return pages.map((p, i) => ({
        key: `page-${i}`,
        caption: `Page ${i + 1}`,
        alt: text[i]!.slice(2, 4).join(" · "),
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">${nodeToString(p.node)}</svg>`)}`,
      }));
    }
    const cards = phoneCards(sections, snapshot, { passable });
    const out: Array<{ key: string; caption: string; alt: string; src: string }> = [];
    for (const s of sections) {
      for (const c of cards.filter((x) => x.section === s.id)) out.push({ key: c.name, caption: c.title, alt: c.text.slice(0, 2).join(": "), src: cardPreviewUrl(c) });
      const img = s.original ? images.ready.get(s.original.asset) : undefined;
      if (img) out.push({ key: `${s.id}-image`, caption: `${s.title} (image)`, alt: s.title, src: img.href });
    }
    return out;
  }, [sections, format, paper, snapshot, images, passable]);
  if (items.length === 0) return null;
  return (
    <section className="app-share__preview" aria-label="Preview" data-testid="share-preview" data-format={format}>
      {items.map((it) => (
        <figure key={it.key} className={`app-share__item app-share__item--${format}`} data-testid="share-preview-item">
          <img src={it.src} alt={it.alt} loading="lazy" />
          <figcaption>{it.caption}</figcaption>
        </figure>
      ))}
    </section>
  );
}
