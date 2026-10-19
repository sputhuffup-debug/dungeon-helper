# Alien module: shared field names

Agents working in parallel on `packages/module-alien` must use these exact ids and field paths so schemas, procedures, presets and the UI agree. Extend freely with extra fields; do not rename these.

## Entity type ids
| id | kind | subtypes |
|---|---|---|
| `alien.character` | character | (PC vs NPC via `fields.isPC`) |
| `alien.creature` | creature | |
| `alien.location` | location | `region`, `sector`, `star-system`, `planet`, `colony`, `site` |
| `alien.faction` | faction | |
| `alien.item` | item | `weapon`, `armor`, `tool`, `medical`, `pharmaceutical`, `food`, `other` |
| `alien.vehicle` | vehicle | |
| `alien.spaceship` | vehicle | |
| `alien.clue` | clue | |
| `alien.job` | job | |
| `alien.encounter` | encounter | |

Subtype is stored at `entity.subtype` (core), not inside `fields`.

## Relationship ids added by the module
`buddy_of`, `rival_of` (character to character, symmetric), `employer_of` (faction to job), `sponsor_of` (faction to job), `crew_of` (character to spaceship), `stationed_at` (faction to location), `emerged_from` (creature to the host it burst from or was ovomorphed out of; written by the life-cycle tracker).

## Play modes
`cinematic`, `campaign`.

## Reference list ids
`alien.skills`, `alien.careers`, `alien.talents`, `alien.critical-injuries`, `alien.mental-traumas`, `alien.ship-classes`, `alien.ship-modules`, `alien.ship-upgrades`, `alien.ship-armaments`, `alien.frames`, `alien.minor-corporations`.

Skill ids (camelCase, bound attribute): heavyMachinery(strength), closeCombat(strength), stamina(strength), rangedCombat(agility), mobility(agility), piloting(agility), observation(wits), survival(wits), comtech(wits), manipulation(empathy), command(empathy), medicalAid(empathy).

Career ids: `colonial-marine`, `colonial-marshal`, `company-agent`, `kid`, `medic`, `officer`, `pilot`, `roughneck`, `scientist`.

Frame ids: `space-truckers`, `colonial-marines`, `frontier-colonists`.

Region ids: `core`, `outer-veil`, `outer-rim`, `frontier`, `far-reach`.
Allegiance ids: `uas` (United Americas), `3we` (Three World Empire), `upp`, `icsc`, `independent`, `unknown`.

## `alien.character.fields`
```
isPC: boolean
android: boolean
career: string            // career id
attributes: { strength, agility, wits, empathy }: number 1..5 (androids up to 8/7)
skills: { <skillId>: number 0..5 }
talents: [{ id: string, count: number }]
stress: number >= 0
personalAgenda: string
agendas: [{ act: number, text: string }]        // cinematic
gear: [{ name: string, weight: number, qty: number, supply?: number, itemId?: string }]
signatureItem: string
cash: number
storyPoints: number 0..3   // cinematic
xp: number                 // campaign
trait: string; goal: string; appearance: string
buddy: string; rival: string   // free text; relationships are the real link
criticalInjuries: [{ id, label, page? }]
mentalTraumas: [{ id, label, page? }]
lifePath: object           // provenance of life-path rolls, optional
background: string         // PC background (pregenerated PCs, p. 157)
// NPC dossier (appearance, trait and goal above are the book's basics; goal = "wants")
role: string; voice: string; fears: string; secret: string; tells: string
sampleLines: string; arc: string          // arc = how they change across the acts (cinematic)
// secret synthetic (android posing as human, p. 25, 77); `android` stays the synthetic flag,
// `attributes` hold the TRUE scores
secretAndroid: boolean
coverAttributes: { strength, agility, wits, empathy }: number 1..5   // shown and rolled in front of players
fairClues: string[]
secretOrders: string
```
Computed: `health = ceil((strength+agility)/2) + hardenedCount`, `resolve = ceil((wits+empathy)/2) + seenItAllCount`, `encumbranceLimit = strength*2`, `encumbrance = sum(gear.weight*qty)`, `coverHealth = max(ceil((cover str+agi)/2), ceil((str+agi)/2))` (Health shown for a secret synthetic), `coverResolve = ceil((cover wits+emp)/2)`.

## `alien.creature.fields`
```
species: string ("xx121" | "neomorph" | ...), stage: string, variant?: string
speed: number, health: number, mobility: number, observation: number
armor: number, armorNotes?: string, acidSplash?: number
attacks: [{ roll: number (1..6), name, dice: number, damage: number|string, armorPiercing?: boolean, effect: string }]
abilities: [{ name, text, page? }]
lifecycleTrigger?: string, containment?: string
loreOnly?: boolean
```

## `alien.location.fields` by subtype
star-system: `starClass` (O B A F G K M), `brightness` (Ia Ib II III IV V D), `region`, `allegiance`, `bodies: [{ type: "gas-giant"|"terrestrial"|"ice"|"asteroid-belt", name?, features?: string[] }]`
planet: `planetType` ("terrestrial"|"ice"|"gas-giant"|"asteroid-belt"), `diameterKm: number`, `gravity: string`, `atmosphere`, `temperature`, `geosphere`, `terrain`, `inhabited: boolean`, `population?: number|string`, `orbitalComponents: string[]`, `affiliation?`, `classification?`, `climate?`, `keyResources?: string[]`, `colonies?: string[]`
colony: `colonySize` ("start-up"|"young"|"established"), `population`, `missions: string[]`, `factions: [{ type: string, name?: string }]`, `allegiance`, `campaignHook?`, `affiliation?`, `classification?`, `resources?`
site: `description` (what the PCs find), `mapId?` (core SiteMap id)
any subtype (shown on the site sheet): `secret`, `puzzle`, `puzzleClue`, `puzzleSolution`, `puzzleFallback`, `threat` (all GM-only by default)

## `alien.faction.fields`
`factionType` ("corporation"|"government"|"military"|"colonial"|"other"), `allegiance`, `history`, `products`, `military`, `leaders`, `locations`, `relations`, `currentActivities`, `reputation: number`, `minor: boolean`

## `alien.job.fields`
`frame`, `jobType` ("job"|"mission"|"expedition"), `distance: number 0..5`, `difficulty: number 1..3`, `payment: number`, `employer: string`, `bonusRewards: string[]`, `mission?: string`, `cargo?: string`, `destination: string`, `complications: string[]`, `plotTwist?: string`, `status` ("offered"|"accepted"|"done"|"declined")

## `alien.item.fields`
weapon: `bonus: number`, `damage: number`, `damageType?` ("normal"|"stun"|"fire"|"energy"), `range` ("adjacent"|"short"|"medium"|"long"|"extreme"), `rangeMin?`, `ammo?` , `power?: number`, `weight: number`, `cost: number`, `special: string[]`
armor: `armorRating: number`, `airSupply?: number`, `weight`, `cost`, `special`
tool/medical/food/pharmaceutical/other: `effect?: string`, `weight`, `cost`, `supply?: number`

## `alien.vehicle.fields`
`length`, `passengers`, `maneuverability: number`, `speed: number`, `hull: number`, `armor: number`, `weapons: string[]`, `cost: number`, `encountered?: string`

## `alien.spaceship.fields`
`shipClass` (C G J M R U X), `manufacturer`, `cost`, `crew`, `signature: number`, `ai: string`, `thrusters: number`, `length`, `hull: number`, `ftl: number`, `armor: number`, `passengers`, `modules: string[]` (ship-module ids), `upgrades: string[]`, `armaments: string[]`

## Tracker ids
`alien.stress`, `alien.story-points`, `alien.clock`, `alien.countdown`, `alien.supply`, `alien.initiative`, `alien.stealth`, `alien.gestation`.

`alien.gestation` is kind `lifecycle`, scope `campaign`: its state lives in `meta.settings["tracker:alien.gestation"]` (`{ instances: LifecycleInstance[] }`, see module-sdk `lifecycle.ts`) and advances with the in-world minutes in `meta.settings.worldMinutes`, which the table clock moves forward. Config: `src/lifecycle.ts`. Variant ids: `standard`, `bambi`, `praetomorph`, `queen`, `ovomorphing`.

Host conditions it sets: `xx121:facehugged`, `xx121:implanted` (set by the `inseminationCheck` dice operation), `xx121:embryo`, `xx121:killed-by-chestburster`, `xx121:killed-by-removal`, `xx121:died-in-surgery`, `xx121:cocooned`, `xx121:ovomorphed`.

## Procedure ids
`alien.world.create`, `alien.system.create`, `alien.job.create`, `alien.lifepath`, `alien.encounter.check`, `alien.shore-leave`, `alien.session-end` (the last is implemented as a hook, not a procedure).

## Table id convention
`alien.<family>.<name>` e.g. `alien.world.atmosphere`, `alien.character.panic`, `alien.jobs.truckers.employer`, `alien.encounters.colony.general`, `alien.lifepath.origin`.

## Narrative fields (`src/narrative.ts`, cinematic mode)
Stored in the core record's `fields`.

- Adventure: `tagline`, `year` (default 2184), `theme` (campaign-theme ids: `killing-greed`, `corporate-intrigue`, `tidings-of-war`, `new-opportunities`, `secret-research`, `echoes-from-the-past`; default `killing-greed`), `targetHours` (default 4), `contentNote`, `truthTie`, `threats`, `zoneOrder`, `countdown` (Act 3 timer), `openingNarration`, `signOffs: { <PC entity id>: string }`. The public mission is the core `playerIntro`, the GM-only truth the core `gmSituation`.
- Act: `minutes` (15-240), `fearStage` (`dread` | `terror` | `horror`), `pressure`, `relief`, `actEnd` (acts 1-2). The one-line summary is the core act `goal`.
- Scene (an event): `aimedAt` (`"everyone"` or a PC/NPC entity id), `trigger`. Title, body ("what happens") and the mandatory flag are core.

Reference lists for the selects: `alien.campaign-themes`, `alien.fear-stages`.

## Adventure builder `alien.builder.cinematic` (`src/builders/cinematic.ts`)
Template `alien.template.cinematic-builder` (three empty acts: 75/100/65 min, dread/terror/horror, one blank event each; the scaffold carries the adventure and act `fields`).
Cast roles: `pcs` (alien.character, `isPC: true`), `npcs` (alien.character), `locations` (alien.location, subtype `site`).
Steps: `basics`, `situation`, `pcs`, `npcs`, `locations`, `act1`, `act2`, `act3`, `finale`, `review`. Review rule ids are `<step>.<check>`, e.g. `pcs.creation`, `act2.relief`.
