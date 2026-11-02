/** Prep panels shown under an entity's tabs: generator provenance, for locations their site maps, and for jobs their people, handouts and site brief. */
import type { Entity } from "@campaign-forge/core";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { JobPanel } from "../jobs/JobPanel";
import { LocationMaps } from "../maps/LocationMaps";
import { GeneratedPanel } from "./GeneratedPanel";

export function EntityPrepPanels({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const generated = !!entity.provenance?.generatorRun;
  const location = def?.kind === "location";
  const job = def?.kind === "job";
  if (!generated && !location && !job) return null;
  return (
    <div className="prep-entity-panels">
      {job && <JobPanel entity={entity} />}
      {location && <LocationMaps entity={entity} />}
      {generated && <GeneratedPanel entity={entity} />}
    </div>
  );
}
