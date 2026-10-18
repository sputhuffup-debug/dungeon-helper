import type { EntityTypeDef, SheetLayout } from "@campaign-forge/module-sdk";
import {
  ALLEGIANCE_IDS,
  REGION_IDS,
  checkbox,
  enumField,
  intField,
  list,
  number,
  objectSchema,
  select,
  stringArray,
  stringField,
  tags,
  text,
  textarea,
} from "./common";

export const STAR_CLASSES = ["O", "B", "A", "F", "G", "K", "M"] as const;
export const BRIGHTNESS_CLASSES = ["Ia", "Ib", "II", "III", "IV", "V", "D"] as const;
export const PLANET_TYPES = ["terrestrial", "ice", "gas-giant", "asteroid-belt"] as const;
export const COLONY_SIZES = ["start-up", "young", "established"] as const;

const regionField = select("region", "Region", [...REGION_IDS], { span: 4, rule: "alien.rule.regions" });
const allegianceField = select("allegiance", "Allegiance", [...ALLEGIANCE_IDS], { span: 4, rule: "alien.rule.allegiance" });

export const locationSchema = objectSchema({
  region: enumField(REGION_IDS, undefined, "Region of charted space (p. 180-181)."),
  allegiance: enumField(ALLEGIANCE_IDS),
  description: stringField(),
  // star-system
  starClass: enumField(STAR_CLASSES, undefined, "Spectral class (p. 243)."),
  brightness: enumField(BRIGHTNESS_CLASSES, undefined, "Brightness class (p. 243)."),
  bodies: {
    type: "array",
    default: [],
    items: {
      type: "object",
      required: ["type"],
      properties: {
        type: enumField(PLANET_TYPES),
        name: { type: "string" },
        features: { type: "array", items: { type: "string" } },
      },
    },
  },
  // planet
  planetType: enumField(PLANET_TYPES),
  diameterKm: intField(0, undefined, undefined, "Planet size roll (p. 237)."),
  gravity: stringField(),
  atmosphere: stringField("thin, breathable, toxic, dense, corrosive, infiltrating or special (p. 238)."),
  temperature: stringField("frozen, cold, temperate, hot or burning (p. 238)."),
  geosphere: stringField("desert, arid, temperate, wet or water world (p. 239)."),
  terrain: stringField("(p. 239)"),
  inhabited: { type: "boolean", default: false },
  population: { type: ["integer", "string"] },
  orbitalComponents: stringArray("(p. 240)"),
  affiliation: stringField(),
  classification: stringField(),
  climate: stringField(),
  keyResources: stringArray(),
  colonies: stringArray("Colony names or entity ids on this world."),
  // colony
  colonySize: enumField(COLONY_SIZES, undefined, "(p. 240)"),
  missions: stringArray("Colony missions (p. 241)."),
  factions: {
    type: "array",
    default: [],
    description: "Factions present (p. 241).",
    items: { type: "object", required: ["type"], properties: { type: { type: "string" }, name: { type: "string" } } },
  },
  campaignHook: stringField("(p. 242)"),
  resources: stringField(),
  // site
  mapId: stringField("Core SiteMap id for the zone overlay (p. 54-56)."),
});

const generalSheet: SheetLayout = {
  sections: [
    {
      id: "overview",
      title: "Overview",
      columns: 3,
      fields: [regionField, allegianceField, textarea("description", "Description")],
    },
  ],
  summary: ["region", "allegiance"],
};

const starSystemSheet: SheetLayout = {
  sections: [
    {
      id: "star",
      title: "Star",
      columns: 3,
      fields: [
        select("starClass", "Spectral class", [...STAR_CLASSES], { span: 4, rule: "alien.rule.star-systems" }),
        select("brightness", "Brightness class", [...BRIGHTNESS_CLASSES], { span: 4, rule: "alien.rule.star-systems" }),
        regionField,
        allegianceField,
        textarea("description", "Description"),
      ],
    },
    {
      id: "bodies",
      title: "System bodies",
      fields: [
        list("bodies", "Bodies", {
          rule: "alien.rule.star-systems",
          config: { columns: [{ path: "type", label: "Type" }, { path: "name", label: "Name" }, { path: "features", label: "Features" }] },
        }),
      ],
    },
  ],
  summary: ["starClass", "brightness", "region"],
};

const planetSheet: SheetLayout = {
  sections: [
    {
      id: "world",
      title: "World",
      columns: 4,
      fields: [
        select("planetType", "Type", [...PLANET_TYPES], { span: 3, rule: "alien.rule.world-creation" }),
        number("diameterKm", "Diameter (km)", { rule: "alien.rule.world-creation" }),
        text("gravity", "Gravity", { span: 3 }),
        text("atmosphere", "Atmosphere", { span: 3, rule: "alien.rule.world-creation" }),
        text("temperature", "Temperature", { span: 3, rule: "alien.rule.world-creation" }),
        text("geosphere", "Geosphere", { span: 3, rule: "alien.rule.world-creation" }),
        text("terrain", "Terrain", { span: 3 }),
        text("climate", "Climate", { span: 3 }),
        checkbox("inhabited", "Inhabited"),
        text("population", "Population", { span: 3 }),
        regionField,
        allegianceField,
        text("affiliation", "Affiliation", { span: 4 }),
        text("classification", "Classification", { span: 4 }),
        tags("orbitalComponents", "Orbital components", { rule: "alien.rule.world-creation" }),
        tags("keyResources", "Key resources"),
        tags("colonies", "Colonies"),
        textarea("description", "Description"),
      ],
    },
  ],
  summary: ["planetType", "atmosphere", "temperature", "inhabited"],
};

const colonySheet: SheetLayout = {
  sections: [
    {
      id: "colony",
      title: "Colony",
      columns: 4,
      fields: [
        select("colonySize", "Size", [...COLONY_SIZES], { span: 3, rule: "alien.rule.colonies" }),
        text("population", "Population", { span: 3 }),
        allegianceField,
        text("affiliation", "Affiliation", { span: 4 }),
        text("classification", "Classification", { span: 4 }),
        text("resources", "Resources", { span: 4 }),
        tags("missions", "Missions", { rule: "alien.rule.colonies" }),
        list("factions", "Factions", {
          rule: "alien.rule.colonies",
          config: { columns: [{ path: "type", label: "Type" }, { path: "name", label: "Name" }] },
        }),
        textarea("campaignHook", "Campaign hook", { rule: "alien.rule.campaign-hooks" }),
        textarea("description", "Description"),
      ],
    },
  ],
  summary: ["colonySize", "population", "allegiance"],
};

const siteSheet: SheetLayout = {
  sections: [
    {
      id: "site",
      title: "Site",
      columns: 1,
      fields: [
        textarea("description", "Description"),
        { path: "mapId", label: "Zone map", widget: "zonemap", span: 12, rule: "alien.rule.zones", config: { zoneKinds: ["cluttered", "open"], borderKinds: ["open", "blocked", "door"] } },
      ],
    },
  ],
  summary: ["mapId"],
};

export const locationType: EntityTypeDef = {
  id: "alien.location",
  kind: "location",
  name: "Location",
  plural: "Locations",
  icon: "map-pin",
  schema: locationSchema,
  sheet: generalSheet,
  defaultVisibility: { campaignHook: "gm", factions: "gm", mapId: "gm" },
  subtypes: [
    { id: "region", name: "Region", sheet: generalSheet },
    { id: "sector", name: "Sector", sheet: generalSheet },
    { id: "star-system", name: "Star system", sheet: starSystemSheet },
    { id: "planet", name: "Planet", sheet: planetSheet },
    { id: "colony", name: "Colony", sheet: colonySheet },
    { id: "site", name: "Site", sheet: siteSheet },
  ],
};
