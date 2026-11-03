/**
 * "Run this job" (a module's adventure source, see sourceActions): a button
 * on the record that makes its adventure, filled from the record, the first
 * time and opens it afterwards; and the banner on that adventure that links
 * back to the record and, when the record's site has no map yet, offers the
 * site map generator. Nothing here knows what a job is.
 */
import type { Adventure, Entity } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import { mapGeneratorsFor } from "../../state/mapgenActions";
import { adventureForEntity, canRunEntity, runFromEntity, sourceNoun } from "../../state/sourceActions";
import { sessionLabel } from "../../state/tableActions";

export function RunFromEntityButton({ entity, size, variant = "primary" }: { entity: Entity; size?: "sm"; variant?: "primary" | "default" }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  useList("adventures"); // the button turns into "Open" once the adventure exists
  const [busy, setBusy] = useState(false);
  const def = canRunEntity(ctx, entity, meta.mode);
  if (!def) return null;
  const existing = adventureForEntity(ctx, entity.id);
  const open = (id: string) => void navigate({ to: "/c/$campaignId/adventures/$adventureId", params: { campaignId: ctx.campaignId, adventureId: id }, search: {} });
  if (existing) {
    return (
      <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: existing.id }} search={{}} className={`cf-btn${size ? " cf-btn--sm" : ""}`} data-testid="run-from-entity" data-state="open">
        Open the adventure
      </Link>
    );
  }
  const run = async () => {
    setBusy(true);
    try {
      const res = await runFromEntity(ctx, entity.id, meta.mode);
      const planned = res.session && res.planned.length ? `; ${res.planned.length} scene${res.planned.length === 1 ? "" : "s"} planned into ${sessionLabel(res.session)}${res.sessionCreated ? " (new)" : ""}` : "";
      pushToast(`Made “${res.adventure.title}” from the ${sourceNoun(ctx, def)}${planned}.`, { tone: "success" });
      open(res.adventure.id);
    } catch (e) {
      pushToast(`Could not make the adventure: ${errorMessage(e)}`, { tone: "danger" });
      setBusy(false);
    }
  };
  return (
    <Button variant={variant} size={size} onClick={() => void run()} disabled={busy} data-testid="run-from-entity" data-state="run" title={`Make an adventure from this ${sourceNoun(ctx, def)}: its scenes, places, map and people filled in, the first scenes planned into the next session`}>
      {busy ? "Making the adventure…" : def.label}
    </Button>
  );
}

/** On an adventure made from a record: the way back to it, and the site map generator when its site has no map yet. */
export function SourceBanner({ adventure }: { adventure: Adventure }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const entity = useRecord("entities", adventure.source?.entity);
  const maps = useList("maps");
  const relationships = useList("relationships");
  if (!adventure.source) return null;
  const def = ctx.module.module.adventureSources?.find((d) => d.id === adventure.source!.def);
  const noun = def ? sourceNoun(ctx, def) : "record";
  if (!entity) {
    return (
      <p className="app-note app-note--warning" data-testid="adventure-source">
        Made from a {noun} that was deleted.
      </p>
    );
  }
  // the record's map brief and its site (a generator that reads a brief from it names the site's relationship)
  let generator: string | undefined;
  let siteRel: string | undefined;
  for (const g of mapGeneratorsFor(ctx.module, meta.mode)) {
    const brief = g.briefFromEntity?.({ id: entity.id, name: entity.name, type: entity.type, fields: entity.fields });
    if (brief) {
      generator = g.id;
      siteRel = brief.site?.relationship;
      break;
    }
  }
  const sites = siteRel ? relationships.filter((r) => r.type === siteRel && r.to === entity.id).map((r) => r.from) : [];
  const siteMap = maps.find((m) => m.location && sites.includes(m.location) && !!m.layout);
  return (
    <div className="app-note app-row prep-source" data-testid="adventure-source">
      <span>
        Runs the {noun}{" "}
        <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: entity.id }} className="app-link-strong">
          {entity.name}
        </Link>
        .
      </span>
      {generator &&
        (siteMap ? (
          <span>
            Site map:{" "}
            <Link to="/c/$campaignId/maps/$mapId" params={{ campaignId: ctx.campaignId, mapId: siteMap.id }} className="app-link-strong">
              {siteMap.name}
            </Link>
          </span>
        ) : (
          <Link to="/c/$campaignId/maps/new" params={{ campaignId: ctx.campaignId }} search={{ generator, from: entity.id }} className="cf-btn cf-btn--sm cf-btn--primary" data-testid="adventure-source-map">
            Generate the site map
          </Link>
        ))}
    </div>
  );
}
