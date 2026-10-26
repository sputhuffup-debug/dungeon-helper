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
damage: integer >= 0, default 0   // damage taken; players may edit; Health left is computed
personalAgenda: string
agendas: [{ act: number, text: string }]        // cinematic
gear: [{ name: string, weight: number, qty: number, supply?: number, itemId?: string }]
signatureItem: string
cash: number
storyPoints: number 0..3   // cinematic; a stored pool, every change logged in the advancement log
xp: number                 // campaign; a stored pool, every award and spend logged in the advancement log
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
Computed: `health = ceil((strength+agility)/2) + hardenedCount`, `resolve = ceil((wits+empathy)/2) + seenItAllCount`, `encumbranceLimit = strength*2`, `encumbrance = sum(gear.weight*qty)`, `coverHealth = max(ceil((cover str+agi)/2), ceil((str+agi)/2))` (Health shown for a secret synthetic), `coverResolve = ceil((cover wits+emp)/2)`, `healthRemaining = max(0, health - damage)`.

## `alien.creature.fields`
```
species: string ("xx121" | "neomorph" | ...), stage: string, variant?: string
speed: number, health: number, mobility: number, observation: number
damage: integer >= 0, default 0   // damage taken (GM-only); Health left is computed
armor: number, armorVsFire?: number, armorNotes?: string, acidSplash?: number
attackTable?: string      // id of the signature attack table, alien.creatures.attack.<variant>
attacks: [{ roll: number (1..6), name, dice: number, damage: number|string, armorPiercing?: boolean, effect: string }]
abilities: [{ name, text, page? }]
lifecycleTrigger?: string, containment?: string
loreOnly?: boolean
```

Computed: `healthRemaining = max(0, health - damage)`.

## Combat at the table (`alien.combat`, `src/combat.ts`)
Health: `alien.character` (`damagePath: damage`, `maxPath: health`; broken: android -> `alien.character.android-critical-damage` via the `androidCriticalDamage` operation, otherwise `alien.character.critical-injury` via `criticalInjury`) and `alien.creature` (`damage`, `health`, `armorPath: armor`, `armorBySource: { fire: armorVsFire }`; broken: XX121 except Stages II-III, and Neomorphs -> `alien.creatures.broken-xenomorph`). Hit sources: `fire`, `fall` (no armor), `stun` (no Health lost), `acid`. Creature turns: `speed`, `attackTable`, acid splash from `acidSplash` (cap `health`). Special attack ids: `disarm`, `pass`, `shove`, `grapple` (roll `closeCombat`). Critical injury condition ids: `critical-injury:<d66>`; android: `android-critical:<row id>`.

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

State in play (stored; maxima stay on the stat line or are computed): `hullDamage: number`, `componentDamage: { name, severity: minor|major, effect, heavyMachinery, comtech, system }[]` (repair rolls still needed), `spareParts: { mechanical, electronic }`, `provisions: number` (person-days of food and water), `cargo: { item, amount, note }[]`, `ownership` (company leased owned). Computed: `hullLeft`, `majorDamageAt`, `disabled`, `leasePerYear`, `leasePerWeek`.

The crew's ship is the entity id in `meta.settings.ship` (session zero question "ship"); travel keeps `meta.settings.currentLocation` in step. Ledger categories and the travel rule: `src/economy.ts`, `src/travel.ts`.

## Tracker ids
`alien.stress`, `alien.story-points`, `alien.clock`, `alien.countdown`, `alien.supply`, `alien.initiative`, `alien.stealth`, `alien.gestation`.

`alien.gestation` is kind `lifecycle`, scope `campaign`: its state lives in `meta.settings["tracker:alien.gestation"]` (`{ instances: LifecycleInstance[] }`, see module-sdk `lifecycle.ts`) and advances with the in-world minutes in `meta.settings.worldMinutes`, which the table clock moves forward. Config: `src/lifecycle.ts`. Variant ids: `standard`, `bambi`, `praetomorph`, `queen`, `ovomorphing`.

Host conditions it sets: `xx121:facehugged`, `xx121:implanted` (set by the `inseminationCheck` dice operation), `xx121:embryo`, `xx121:killed-by-chestburster`, `xx121:killed-by-removal`, `xx121:died-in-surgery`, `xx121:cocooned`, `xx121:ovomorphed`.

## Procedure ids
`alien.world.create`, `alien.system.create`, `alien.job.create`, `alien.lifepath`, `alien.encounter.check`, `alien.shore-leave`, `alien.between-jobs`, `alien.agendas` (cinematic agenda drafts, `src/procedures/agendas.ts`), `alien.session-end` (the last is implemented as a hook, not a procedure).

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

## Site map generator `alien.map.site` (`src/maps/`)
Registered in `alienModule.mapGenerators`. Stages (re-seedable through `stageSeeds`, in order): `graph`, `layout`, `borders`, `dressing`, `encounters`; validation runs after them and retries from `graph` (up to 50 attempts).

Inputs (`MAP_INPUT_SCHEMA`; `normalizeMapInputs` fills defaults): `site_type` (`colony_block`, `station_deck`, `starship`, `derelict`, `mine`, `research_lab`, `alien_ruin`), `size` (`small` 12-20, `medium` 20-32, `large` 32-45 playable floor zones), `decks` 1-3, `crew` 1-5, `runtime_h` 1-5, `threats: [{ creature: <creature preset id>, act: 1-3, count }]`, `duct_density` (`none`, `sparse`, `normal`, `dense`), `darkness` 0-100, `hazards` (`fire`, `vacuum`, `zero_g`, `radiation`, `flooding`), `win_paths` (`escape_craft`, `airlock`, `self_destruct`, `signal`, `seal_section`), `key_rooms: [{ name, act, description }]`, `puzzles: [{ id, answer, act, room }]`, `npcs: [{ name, role: crew | survivor | android }]`.

Decks: floor decks `A`, `B`... (`layer: "floor"`); duct sheets `<deck>-duct` (over the deck) and `<deck>-under` (a crawlspace under the bottom deck, normal and dense maps), with `layer: "duct"`, `serves: <floor deck id>`. Every deck and sheet has a `level`, one order lowest first (crawlspace under A, A, ducts over A, B, ducts over B...).

Zone ids `Z01`... on floor decks. Duct zones sit on their own sheet, a maze not drawn to the deck's scale: an exit zone takes its floor zone's id plus `d` (`Z07d`), every other duct zone is `D01`, `D02`... (numbered across sheets in reading order). All are `layer: "duct"`, `kind: "crawlspace"`, never cluttered, 8-20 per sheet; exits join their floor zone by an `access` border (no segment, hidden until found, except at the start). Zone `area`: `ops`, `medical`, `habitation`, `engineering`, `cargo`, `science`, `security`, `transit`, `alien`.

Zone `flags`: `sizeM`, `outerEdges` (hull- or exterior-facing segments), `outerHull` (space sites), `autoSeal`, `outerArmor`, `dark`, `flammable`, `atmosphere` (`"none"` for vacuum), `gravity` (`false` for zero-G), `radiation` (`weak` | `strong`), `flooded`, `dropM`, `deadEnd`, `type` (room catalog id), `ductTo: { zone, deck }` (floor zone with an access point: the duct exit it leads to).
Duct zone `flags`: `sizeM`, `singleFile: true`, `dark: true`, `ductType` (`run` 1 m wide, `junction` 3-4 runs, `bend`, `dead-end`, `chamber` = vent chamber), `exitTo: { zone, name, deck }` (exits: the floor zone, its room name or a spot like "Corridor B, near Galley", and its deck), `shaftTo: [{ zone, deck, way: "up" | "down", dropM, oneWay? }]` (shaft ends), and hazards `fan`, `steam` (hot pipes), `flooded`, `collapsed`, `oneWayDrop` (the top of a drop).
Border `flags`: `armored`, `outOfBounds` (permanently sealed blast doors), `sealable` (seal-section blast door), `via` (`stairs`, `ladder`, `lift`), `duct` (links on a duct sheet and shafts), `collapsed` (a `wall` between two duct zones, armor 2, hp 10, hidden), `dropM`, and on `shaft` borders `direction` (`"both"` climbable, `"down"` one-way from `a`, the top, to `b`) and `oneWay`.
Markers: `start` (player-visible); `spawn` (`data`: creature, name, count, tier, cost, speed, state, wakesOn, distanceFromStart, focus, contactStretches), `waypoint` (`spawn`, `order`), `clue` (`puzzle`, `answer`, `target`, `anchor`, `route`), `npc` (`name`, `role`; one per act), `win` (`type`, `requires`, `border`), `hazard`: all GM-only.
`layout.meta` (GM-only): `acts["1"|"2"|"3"] = { budget, cost, presence, presenceLabel, presenceDice, focus }`, `keyRooms`, `sequence`, `wins`, `budgetNote`, `ducts: [{ deck, serves, role: "upper" | "lower", level, zones, exits: [{ zone, to, name }] }]`.

Zone tables (`siteMapGenerator.zoneTables`): `alien.maps.duct-events` for `{ layer: "duct" }`, label "Duct event".

Helpers: `playerLayout(layout, act, { found, revealed })` (duct zones only once known; exit labels and duct hazards once revealed), `alienPassable(border, act, move?)` (a one-way drop passes downward only), `zoneAdjacency`, `distancesFrom`, `zoneDistances`, `rangeBandFor(distance)`, `createMapContext(seed, { stageSeeds, tables })`, `inputsFromAdventure(reviewContext)`.

Tables (family `maps`): `alien.maps.location-detail` (p. 297), `alien.maps.anomalous-detail` (p. 298), `alien.maps.salvage` (p. 297; result `{ common, rare }`), `alien.maps.duct-events` (module table, unverified; D66 in pairs; result `{ kind: "encounter" | "danger" | "comfort", effect, salvage? }`).
