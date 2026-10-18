/** Prep panels shown under an entity's tabs: generator provenance and, for locations, their site maps. */
import type { Entity } from "@campaign-forge/core";
import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { LocationMaps } from "../maps/LocationMaps";
import { GeneratedPanel } from "./GeneratedPanel";

export function EntityPrepPanels({ entity, def }: { entity: Entity; def: EntityTypeDef | undefined }) {
  const generated = !!entity.provenance?.generatorRun;
  const location = def?.kind === "location";
  if (!generated && !location) return null;
  return (
    <div className="prep-entity-panels">
      {location && <LocationMaps entity={entity} />}
      {generated && <GeneratedPanel entity={entity} />}
    </div>
  );
}
