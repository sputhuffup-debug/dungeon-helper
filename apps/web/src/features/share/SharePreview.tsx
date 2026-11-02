/** Parts the group share and the player packets both use: loading the bodies a share reads, the format choice and the preview. */
import { SHARE_VIEWER, canSeeHandout, generatorFor, type Id, type PlayerShare, type Viewer } from "@campaign-forge/core";
import type { MapGeneratorDef } from "@campaign-forge/module-sdk";
import { nodeToString } from "@campaign-forge/ui";
import { useMemo } from "react";
import { PAPER_LABELS, type Paper } from "../../lib/paper";
import type { CampaignContextValue } from "../../state/CampaignProvider";
import { cardPreviewUrl, type LoadedImages } from "./shareExport";
import { packetPages, phoneCards, sharePageHtml, type ShareFormat, type ShareSection } from "./shareLayout";

export type ShareCtx = Pick<CampaignContextValue, "store" | "registry" | "whenDocSynced" | "module">;

/** Open and load the bodies a share reads: the scene's read-aloud, the adventure's player intro and the handouts these viewers can see. */
export async function loadShareDocs(ctx: ShareCtx, sceneId: Id | undefined, viewers: Viewer[] = [SHARE_VIEWER]): Promise<void> {
  const ids: Array<Id | undefined> = [];
  const scene = sceneId ? ctx.store.get("scenes", sceneId) : undefined;
  if (scene) {
    ids.push(scene.readAloudDoc);
    const act = scene.act ? ctx.store.get("acts", scene.act) : undefined;
    const adventure = act ? ctx.store.get("adventures", act.adventure) : undefined;
    ids.push(adventure?.playerIntroDoc);
  }
  const maps = ctx.store.toJSON();
  for (const h of Object.values(maps.handouts)) if (viewers.some((v) => canSeeHandout(h, v, maps, ctx.module.module))) ids.push(h.bodyDoc);
  await Promise.all(
    [...new Set(ids.filter((x): x is Id => !!x))].map((id) => {
      ctx.registry.open(id);
      return ctx.whenDocSynced(id).catch(() => undefined);
    }),
  );
}

/** Map id -> passability rule, for drawing maps the way the module's generator does. */
export function usePassable(ctx: ShareCtx, version: number): (id: string) => MapGeneratorDef["passable"] | undefined {
  return useMemo(() => {
    const byId = new Map(ctx.store.list("maps").map((m) => [m.id, generatorFor(m, ctx.module.module)?.passable] as const));
    return (id: string) => byId.get(id);
  }, [ctx, version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const FORMATS: Array<{ id: ShareFormat; label: string }> = [
  { id: "images", label: "Images for phones" },
  { id: "pdf", label: "PDF packet" },
  { id: "page", label: "Web page (one file)" },
];

export function FormatFieldset({ format, setFormat, paper, setPaper, name }: { format: ShareFormat; setFormat: (f: ShareFormat) => void; paper: Paper; setPaper: (p: Paper) => void; name: string }) {
  return (
    <fieldset className="app-fieldset">
      <legend className="app-label">Send as</legend>
      {FORMATS.map((f) => (
        <label key={f.id} className="app-toggle">
          <input type="radio" name={name} checked={format === f.id} onChange={() => setFormat(f.id)} data-testid={`share-format-${f.id}`} />
          {f.label}
        </label>
      ))}
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
  );
}

/** What the files will hold: the phone cards, the PDF's pages, or the web page itself. */
export function SharePreview({
  sections,
  format,
  paper,
  snapshot,
  images,
  passable,
}: {
  sections: ShareSection[];
  format: ShareFormat;
  paper: Paper;
  snapshot: PlayerShare | undefined;
  images: LoadedImages;
  passable: (id: string) => MapGeneratorDef["passable"] | undefined;
}) {
  const page = useMemo(() => (format === "page" && snapshot && sections.length ? sharePageHtml(sections, snapshot, { passable }) : undefined), [format, snapshot, sections, passable]);
  const items = useMemo(() => {
    if (!snapshot || sections.length === 0 || format === "page") return [];
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
  if (page) {
    return (
      <section className="app-share__preview app-share__preview--page" aria-label="Preview" data-testid="share-preview" data-format={format}>
        <iframe className="app-share__page" title="Preview of the web page" srcDoc={page} sandbox="" data-testid="share-preview-page" />
      </section>
    );
  }
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
