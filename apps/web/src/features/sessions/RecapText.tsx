/**
 * A recap line's text with its links: the first place each link's label
 * appears in the text becomes a link (entities and sessions open the record,
 * a thread opens the arc board); the rest stays text. The read-aloud for the
 * players (`PlayerRecapView`) draws its lines without links.
 */
import type { PlayerRecap, RecapLink } from "@campaign-forge/core";
import type { ReactNode } from "react";
import { useRecordLinks } from "../../components/EntityLinkContext";
import "./recap.css";

export function RecapText({ text, links, campaignId }: { text: string; links?: RecapLink[] | undefined; campaignId: string }) {
  const open = useRecordLinks();
  const spots: Array<{ at: number; link: RecapLink }> = [];
  for (const l of links ?? []) {
    const at = text.indexOf(l.label);
    if (at < 0 || spots.some((s) => at < s.at + s.link.label.length && s.at < at + l.label.length)) continue;
    spots.push({ at, link: l });
  }
  spots.sort((a, b) => a.at - b.at);
  const out: ReactNode[] = [];
  let i = 0;
  for (const { at, link } of spots) {
    if (at > i) out.push(text.slice(i, at));
    const label = link.label;
    if (link.kind === "entity") {
      out.push(
        <button key={`${link.kind}:${link.id}:${at}`} type="button" className="app-linkbtn" onClick={() => open.openEntity(link.id)}>
          {label}
        </button>,
      );
    } else if (link.kind === "session") {
      out.push(
        <button key={`${link.kind}:${link.id}:${at}`} type="button" className="app-linkbtn" onClick={() => open.openSession(link.id)}>
          {label}
        </button>,
      );
    } else if (link.kind === "thread") {
      out.push(
        <a key={`${link.kind}:${link.id}:${at}`} className="app-recap__thread" href={`/c/${campaignId}/arcs`}>
          {label}
        </a>,
      );
    } else out.push(label);
    i = at + label.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return <>{out}</>;
}

/** The read-aloud as the players see it (player screen): headings and lines, nothing to click. */
export function PlayerRecapView({ recap }: { recap: PlayerRecap }) {
  return (
    <section className="app-recap-read" aria-label={recap.title} data-testid="player-recap">
      <h2 className="app-recap-read__title">{recap.title}…</h2>
      {recap.sections.map((s) => (
        <div key={s.id} className="app-recap-read__section">
          <h3 className="app-recap-read__heading">{s.title}</h3>
          <ul className="app-recap-read__lines">
            {s.lines.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
