/** Prep panels shown under an entity's tabs: generator provenance, for locations their site maps, for jobs their people, handouts and site brief, and the campaign arcs (clues, contacts, heat) when the module keeps them. */
import type { Entity } from "@campaign-forge/core";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { ArcEntityPanel } from "../arcs/ArcEntityPanel";
import { JobPanel } from "../jobs/JobPanel";
import { LocationMaps } from "../maps/LocationMaps";
import { arcsDefOf } from "../../state/arcActions";
import { useCampaign, useMeta } from "../../state/hooks";
import { GeneratedPanel } from "./GeneratedPanel";

export function EntityPrepPanels({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const arcs = !!arcsDefOf(ctx.module, meta.mode);
  const generated = !!entity.provenance?.generatorRun;
  const location = def?.kind === "location";
  const job = def?.kind === "job";
  if (!generated && !location && !job && !arcs) return null;
  return (
    <div className="prep-entity-panels">
      {job && <JobPanel entity={entity} />}
      {arcs && <ArcEntityPanel entity={entity} def={def} />}
      {location && <LocationMaps entity={entity} />}
      {generated && <GeneratedPanel entity={entity} />}
    </div>
  );
}
