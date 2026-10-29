/** Scene pane: purpose, status, location, participants, clues, encounter, map, events, body and read-aloud text. */
import { newId, type Scene, type SceneStatus } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge, Button, Card, IconButton } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { createMapForScene, ensureDoc, updateScene } from "../../state/prepActions";
import { useCampaign, useList } from "../../state/hooks";
import { CommitInput, EntityListInput, EntityRefInput, useTypesOfKind } from "./fields";

const STATUSES: SceneStatus[] = ["planned", "run", "skipped"];

export function SceneEditor({ scene }: { scene: Scene }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const locationTypes = useTypesOfKind(["location"]);
  const participantTypes = useTypesOfKind(["character", "creature", "faction", "vehicle"]);
  const clueTypes = useTypesOfKind(["clue"]);
  const encounterTypes = useTypesOfKind(["encounter"]);
  const maps = useList("maps");
  const map = scene.map ? maps.find((m) => m.id === scene.map) : undefined;
  const set = (patch: Partial<Scene>) => updateScene(ctx, scene.id, patch);

  const createMap = () => {
    const m = createMapForScene(ctx, scene.id);
    void navigate({ to: "/c/$campaignId/maps/$mapId", params: { campaignId: ctx.campaignId, mapId: m.id } });
  };

  const events = scene.events;
  const setEvents = (next: Scene["events"]) => set({ events: next });

  return (
    <div className="app-stack" data-testid="scene-editor">
      <Card title="Scene">
        <div className="app-form__row">
          <label className="app-label">
            <span>Title</span>
            <CommitInput value={scene.title} label="Scene title" onCommit={(v) => set({ title: v.trim() || scene.title })} testId="scene-title" />
          </label>
          <label className="app-label prep-narrow">
            <span>Status</span>
            <select className="cf-select" aria-label="Scene status" value={scene.status} onChange={(e) => set({ status: e.target.value as SceneStatus })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="app-label">
          <span>Purpose</span>
          <CommitInput value={scene.purpose ?? ""} label="Scene purpose" placeholder="What this scene is for, in one line" grow onCommit={(v) => set({ purpose: v.trim() || undefined })} />
        </label>
        <dl className="prep-scene-refs">
          <div>
            <dt>Location</dt>
            <dd>
              <EntityRefInput value={scene.location} types={locationTypes} label="Location" onChange={(id) => set({ location: id })} />
            </dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd>
              <EntityListInput value={scene.participants} types={participantTypes} label="Participant" onChange={(ids) => set({ participants: ids })} />
            </dd>
          </div>
          <div>
            <dt>Clues</dt>
            <dd>
              <EntityListInput value={scene.clues} types={clueTypes} label="Clue" onChange={(ids) => set({ clues: ids })} />
            </dd>
          </div>
          <div>
            <dt>Encounter</dt>
            <dd>
              <EntityRefInput value={scene.encounter} types={encounterTypes} label="Encounter" onChange={(id) => set({ encounter: id })} />
            </dd>
          </div>
          <div>
            <dt>Map</dt>
            <dd className="app-row">
              {map ? (
                <>
                  <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId: ctx.campaignId, mapId: map.id }} className="cf-btn cf-btn--sm" data-testid="open-scene-map">
                    Open {map.name}
                  </Link>
                  <Badge>
                    {map.zones.length} zone{map.zones.length === 1 ? "" : "s"}
                  </Badge>
                </>
              ) : (
                <span className="cf-muted">None</span>
              )}
              <select className="cf-select cf-input--inline" aria-label="Scene map" value={scene.map ?? ""} onChange={(e) => set({ map: e.target.value || undefined })}>
                <option value="">No map</option>
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={createMap} data-testid="create-scene-map">
                Create map
              </Button>
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Events"
        subtitle="Mandatory events must happen in this scene; optional ones are there if the table needs them."
        actions={
          <Button size="sm" onClick={() => setEvents([...events, { id: newId(), text: "", mandatory: false }])} data-testid="add-event">
            + Event
          </Button>
        }
      >
        {events.length === 0 ? (
          <p className="cf-muted">No events.</p>
        ) : (
          <ul className="prep-events" data-testid="events">
            {events.map((ev, i) => (
              <li key={ev.id} className={`prep-event${ev.done ? " is-done" : ""}`}>
                <input type="checkbox" className="cf-checkbox" aria-label={`Done: ${ev.text || `event ${i + 1}`}`} checked={ev.done === true} onChange={(e) => setEvents(events.map((x) => (x.id === ev.id ? { ...x, done: e.target.checked } : x)))} />
                <CommitInput value={ev.text} label={`Event ${i + 1}`} placeholder="What happens" grow className="cf-input prep-event__text" onCommit={(v) => setEvents(events.map((x) => (x.id === ev.id ? { ...x, text: v } : x)))} />
                <Button size="sm" active={ev.mandatory} onClick={() => setEvents(events.map((x) => (x.id === ev.id ? { ...x, mandatory: !x.mandatory } : x)))} aria-label={`Mandatory: ${ev.text || `event ${i + 1}`}`}>
                  {ev.mandatory ? "Mandatory" : "Optional"}
                </Button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Move event ${i + 1} up`}
                  icon="↑"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...events];
                    const [x] = next.splice(i, 1);
                    if (x) next.splice(i - 1, 0, x);
                    setEvents(next);
                  }}
                />
                <IconButton size="sm" variant="ghost" label={`Delete event ${i + 1}`} icon="×" onClick={() => setEvents(events.filter((x) => x.id !== ev.id))} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Read-aloud text" subtitle="Boxed text for the players.">
        {scene.readAloudDoc ? (
          <RichTextEditor docId={scene.readAloudDoc} label="Read-aloud text" placeholder="What the players see and hear…" className="prep-readaloud" />
        ) : (
          <Button size="sm" onClick={() => ensureDoc(ctx, "scenes", scene.id, "readAloudDoc")}>
            Add read-aloud text
          </Button>
        )}
      </Card>

      <Card title="Scene notes" subtitle="Triggers, NPC behaviour, what happens if… Type @ to link an entity.">
        <RichTextEditor docId={scene.bodyDoc} label="Scene body" placeholder="Write the scene… type @ to link or create an entity" />
      </Card>
    </div>
  );
}
