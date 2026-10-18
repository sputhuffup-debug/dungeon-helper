import { appearancesTimeline, type Entity, type TimelineEvent } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { Badge, Button, EmptyState, IconButton } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useCampaign, useList, useMapVersion, useMeta } from "../../state/hooks";

export function TimelineTab({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const links = useRecordLinks();
  const v = useMapVersion("*");
  const appearances = useMemo(
    () => appearancesTimeline(ctx.store, entity.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.store, entity.id, v],
  );
  const filter = useMemo(() => (t: TimelineEvent) => t.entities.includes(entity.id), [entity.id]);
  const events = useList("timeline", filter);
  const sortedEvents = [...events].sort((a, b) => a.inWorldDate.localeCompare(b.inWorldDate));
  const [date, setDate] = useState(meta.currentDate ?? "");
  const [text, setText] = useState("");

  return (
    <div className="app-stack">
      <section aria-label="In-world events">
        <h3 className="app-subtitle">In-world events</h3>
        <form
          className="app-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            ctx.store.createTimelineEvent({ inWorldDate: date || meta.currentDate || "", text: text.trim(), entities: [entity.id] });
            setText("");
          }}
        >
          <input className="cf-input app-input--date" aria-label="In-world date" value={date} onChange={(e) => setDate(e.target.value)} placeholder="date" />
          <input className="cf-input app-grow" aria-label="Event" value={text} onChange={(e) => setText(e.target.value)} placeholder={`What happened to ${entity.name}?`} />
          <Button type="submit">Add</Button>
        </form>
        {sortedEvents.length === 0 ? (
          <p className="cf-muted">No events yet.</p>
        ) : (
          <ul className="app-list">
            {sortedEvents.map((t) => (
              <li key={t.id} className="app-list__row">
                <span className="cf-mono">{t.inWorldDate}</span>
                <span>{t.text}</span>
                <IconButton className="app-list__end" size="sm" variant="ghost" label="Remove event" icon="×" onClick={() => ctx.store.remove("timeline", t.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Appearances">
        <h3 className="app-subtitle">Appearances</h3>
        {appearances.length === 0 ? (
          <EmptyState title="No appearances" text="Scenes this entity takes part in, and sessions where they ran, show up here." />
        ) : (
          <ul className="app-list">
            {appearances.map((a) => (
              <li key={`${a.kind}:${a.id}:${a.sessionId ?? ""}`} className="app-list__row">
                <Badge tone={a.kind === "session" ? "accent" : "muted"}>{a.kind}</Badge>
                <button type="button" className="app-linkbtn" onClick={() => (a.kind === "session" ? links.openSession(a.id) : openScene(a.id))}>
                  {a.title}
                </button>
                {a.date && <span className="cf-muted">{formatDate(a.date)}</span>}
                <span className="cf-muted app-list__end">{a.via}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  function openScene(sceneId: string) {
    const scene = ctx.store.get("scenes", sceneId);
    const act = scene?.act ? ctx.store.get("acts", scene.act) : undefined;
    if (act) links.openAdventure(act.adventure);
  }
}
