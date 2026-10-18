# Spot check: Alien RPG (Evolved Edition) 0.1.0

Module `alien`, data status **verified**. Source: Alien: The Roleplaying Game, Core Rules, Evolved Edition (2025).

Seed `spot-check-2026-10`, 10 picks per table family, per preset entity type and per reference list: 242 items.

How to use: open the cited page, find the row (by its roll total or range), compare the label and result with the book, and tick the box. Rows marked `unverified` were entered from general knowledge; a tick means the row matches the book, a note under the item means it does not. When every pick of a family passes, clear `unverified` on that family's tables.

Regenerate with `pnpm table-lint --module alien --spotcheck <file> --spotcheck-seed spot-check-2026-10 --per-file 10`.

## Tables

### Family `character` (5 tables, 81 rows)

- [ ] `alien.character.panic` · p. 72-73 · 1d6 = 10 · **Flee** · effect: Flee to an adjacent zone at once, stres…, traumaCheck: true
- [ ] `alien.character.mental-trauma` · p. 74 · d66 = 41-43 · **Worrisome** · id: worrisome, effect: Small worries the GM picks count as tra…
- [ ] `alien.character.mental-trauma` · p. 74 · d66 = 44 · **Changed Personality** · id: changed-personality, effect: Take a new personal agenda, set by the …
- [ ] `alien.character.mental-trauma` · p. 74 · d66 = 63 · **Violent** · id: violent, effect: Panic results of 8 or more become Frenz…
- [ ] `alien.character.mental-trauma` · p. 74 · d66 = 66 · **Personality Split** · id: personality-split, effect: Make a second persona (name, Wits, Empa…
- [ ] `alien.character.critical-injury` · p. 70 · d66 = 23 · **Broken Fingers** · id: broken-fingers, name: Broken Fingers, fatal: false, timeLimit: 
- [ ] `alien.character.critical-injury` · p. 70 · d66 = 26 · **Slashed Shoulder** · id: slashed-shoulder, name: Slashed Shoulder, fatal: false, timeLimit: 
- [ ] `alien.character.critical-injury` · p. 70 · d66 = 34 · **Injured Throat** · id: injured-throat, name: Injured Throat, fatal: false, timeLimit: 
- [ ] `alien.character.critical-injury` · p. 70 · d66 = 65 · **Crushed Head** · id: crushed-head, name: Crushed Head, fatal: true, timeLimit: 
- [ ] `alien.character.campaign-theme` · p. 158 · 1d6 = 4 · **New Opportunities** · theme: new-opportunities

### Family `creatures` (12 tables, 65 rows)

- [ ] `alien.creatures.attack.facehugger` · p. 213 · 1d6 = 3-4 · **Tail Grapple** · roll: 3, rollTo: 4, name: Tail Grapple, dice: 0
- [ ] `alien.creatures.attack.queen` · p. 221 · 1d6 = 3 · **Beastly Bite** · roll: 3, name: Beastly Bite, dice: 10, damage: 1
- [ ] `alien.creatures.attack.queen` · p. 221 · 1d6 = 4 · **Charge** · roll: 4, name: Charge, dice: 8, damage: 4 (2 for a Queen)
- [ ] `alien.creatures.attack.neomorph-adult` · p. 225 · 1d6 = 1 · **Terrifying Hiss** · roll: 1, name: Terrifying Hiss, dice: 0, damage: 0
- [ ] `alien.creatures.attack.neomorph-adult` · p. 225 · 1d6 = 3 · **Deadly Grab** · roll: 3, name: Deadly Grab, dice: 8, damage: 1
- [ ] `alien.creatures.attack.tanakan-scorpionid` · p. 230 · 1d6 = 1 · **Retreat** · roll: 1, name: Retreat, dice: 0, damage: 0
- [ ] `alien.creatures.attack.tanakan-scorpionid` · p. 230 · 1d6 = 2 · **Pinned Down** · roll: 2, name: Pinned Down, dice: 10, damage: 1
- [ ] `alien.creatures.attack.tanakan-scorpionid` · p. 230 · 1d6 = 4 · **Flailing Strike** · roll: 4, name: Flailing Strike, dice: 8, damage: 1
- [ ] `alien.creatures.attack.swarm` · p. 231 · 1d6 = 1 · **Consume** · roll: 1, name: Consume, dice: 0, damage: 0
- [ ] `alien.creatures.attack.swarm` · p. 231 · 1d6 = 3 · **Suffocating Swarm** · roll: 3, name: Suffocating Swarm, dice: 0, damage: 0

### Family `encounters` (12 tables, 213 rows)

- [ ] `alien.encounters.star-system` · p. 254 · d66 = 13 · **Small survey ship** · encounter: Small survey ship, vessel: true, entry: 13
- [ ] `alien.encounters.star-system` · p. 254 · d66 = 42 · **M-class commercial towing vehicle (not towing anything)** · encounter: M-class commercial towing vehicle (not …, vessel: true, entry: 42
- [ ] `alien.encounters.star-system-remote` · p. 254 · d66 = 42 · **Asteroid drill ship** · encounter: Asteroid drill ship, vessel: true, entry: 12
- [ ] `alien.encounters.star-system-uncharted` · p. 254 · d66 = 64 · **M-class commercial starfreighter** · encounter: M-class commercial starfreighter, vessel: true, entry: 14
- [ ] `alien.encounters.ship-reactions` · p. 254 · 2d6 = 3-4 · **Dismissive** · reaction: dismissive, detail: Declines any request for information or…
- [ ] `alien.encounters.surface` · p. 255 · 3d6 = 10 · **Rough Terrain** · uninhabited: Rough Terrain, colonized: Rough Terrain, detail: Rocks or dense vegetation halve travel …
- [ ] `alien.encounters.colony.general` · p. 255 · d66 = 45 · **Corporate investigator** · encounter: Corporate investigator, entry: 45
- [ ] `alien.encounters.colony.general` · p. 255 · d66 = 66 · **Cleaning crew** · encounter: Cleaning crew, entry: 66
- [ ] `alien.encounters.colony.public` · p. 256 · d66 = 34-36 · **Taxi driver or guide offering to show you the best food/hotel/entertainment** · encounter: Taxi driver or guide offering to show y…
- [ ] `alien.encounters.colony.industrial` · p. 257 · d66 = 34-36 · **Repair team fixing crucial infrastructure** · encounter: Repair team fixing crucial infrastructu…

### Family `jobs` (22 tables, 193 rows)

- [ ] `alien.jobs.ship-type` · p. 246 · 1d6 = 1 · **M-Class Starfreighter** · ship: M-Class Starfreighter
- [ ] `alien.jobs.truckers.bonus` · p. 244 · d66 = 51-53 · **Ship module/feature** · bonus: Ship module/feature
- [ ] `alien.jobs.truckers.mission` · p. 245 · d66 = 22 · **Ice/Water** · cargo: Ice/Water, description: Water, water ice or some other rare fro…
- [ ] `alien.jobs.truckers.mission` · p. 245 · d66 = 64-65 · **Livestock/Animals** · cargo: Livestock/Animals, description: Cattle in stasis for an off-world ranch.
- [ ] `alien.jobs.marines.mission` · p. 248 · d66 = 43-46 · **Bug Hunt** · mission: Bug Hunt, description: Wipe out local alien life that threaten…
- [ ] `alien.jobs.marines.destination` · p. 248 · d66 = 56-61 · **Prison Complex** · destination: Prison Complex, description: A remote penal colony of violent inmate…
- [ ] `alien.jobs.marines.destination` · p. 248 · d66 = 62-63 · **Radar/Sensor Site** · destination: Radar/Sensor Site, description: An automated sensor site, perhaps with …
- [ ] `alien.jobs.colonists.employer.mining` · p. 250 · 1d6 = 1 · **Chigusa** · name: Chigusa, factionType: corporation
- [ ] `alien.jobs.colonists.destination` · p. 251 · d66 = 32-35 · **Asteroid Belt** · destination: Asteroid Belt, description: An asteroid deep inside a dense, comple…
- [ ] `alien.jobs.colonists.complications` · p. 251 · d66 = 53-62 · **Deadly Treasure** · complication: Deadly Treasure, description: Something lethal waits there unknown to…

### Family `lifepath` (38 tables, 225 rows)

- [ ] `alien.lifepath.origin.ua.home` · p. 283 · 1d6 = 4 · **Tartarus/Micor Sectors** · home: Tartarus/Micor Sectors
- [ ] `alien.lifepath.origin.independent.home` · p. 283 · 1d6 = 4 · **Trailward Frontier** · home: Trailward Frontier, region: frontier
- [ ] `alien.lifepath.early-life.company` · p. 284 · d66 = 41-43 · **Embittered indentured workers** · company: Embittered indentured workers
- [ ] `alien.lifepath.early-life.experience` · p. 284 · d66 = 24-26 · **Helping others at real cost to yourself** · skills: {…}
- [ ] `alien.lifepath.life-event` · p. 285 · d66 = 13-14 · **Got away with a crime** · attributes: {…}, psych: 1
- [ ] `alien.lifepath.career-skill.kid` · p. 286 · d3 = 1 · **Mobility** · skill: mobility, skills: {…}
- [ ] `alien.lifepath.favors` · p. 287 · 1d6 = 6 · **New Friend** · favor: new-friend, notes: [1 items]
- [ ] `alien.lifepath.posting.company-agent` · p. 288-289 · 1d6 = 6 · **Troubleshooter** · career: company-agent, note: Surprise inspections and power., bonusGearRolls: 1
- [ ] `alien.lifepath.posting.kid` · p. 288-289 · 1d6 = 4 · **School's Out** · career: kid, note: Classes by day, wild after.
- [ ] `alien.lifepath.posting.officer` · p. 288-289 · 1d6 = 1 · **Security Detail** · career: officer, note: A punishment posting.

### Family `shore-leave` (5 tables, 42 rows)

- [ ] `alien.shore-leave.marines` · p. 257 · d66 = 14-16 · **A Marine from another platoon asks a favor; pays $300, but there might be a catch** · event: A Marine from another platoon asks a fa…, payment: 300
- [ ] `alien.shore-leave.marines` · p. 257 · d66 = 45-46 · **The PCs' lieutenant might be replaced** · event: The PCs' lieutenant might be replaced
- [ ] `alien.shore-leave.marines` · p. 257 · d66 = 64-66 · **A platoon member marks a special occasion with an informal dinner and a speech** · event: A platoon member marks a special occasi…, followUp: Roll for a social encounter.
- [ ] `alien.shore-leave.marines.luxuries` · p. 257 · 1d6 = 1 · **They got away with it** · outcome: got-away
- [ ] `alien.shore-leave.marines.luxuries` · p. 257 · 1d6 = 3 · **Logistics are investigating the theft** · outcome: investigated
- [ ] `alien.shore-leave.marines.lieutenant` · p. 257 · 1d6 = 1 · **They are being promoted** · outcome: promoted
- [ ] `alien.shore-leave.others` · p. 258 · d66 = 24-26 · **A ceremony or celebration at the location** · event: A ceremony or celebration at the locati…
- [ ] `alien.shore-leave.others` · p. 258 · d66 = 31-33 · **Red tape: the PCs' papers have irregularities. Negotiate or bribe a way out?** · event: Red tape: the PCs' papers have irregula…
- [ ] `alien.shore-leave.others` · p. 258 · d66 = 61-63 · **A local commodity on offer for D6 x $400, resellable elsewhere at 50% profit; roll a stress die, a facehugger or a success means a scam** · event: A local commodity on offer for D6 x $40…, costDice: 1d6, costPer: 400, resaleProfit: 0.5
- [ ] `alien.shore-leave.others` · p. 258 · d66 = 64-66 · **The PCs find a haven: a beauty spot, quiet lounge or little-known bar, a great place to hide away** · event: The PCs find a haven: a beauty spot, qu…

### Family `system` (6 tables, 37 rows)

- [ ] `alien.system.terrestrial-planets` · p. 243 · 1d6 = 3 · **3 terrestrial planets** · count: 3
- [ ] `alien.system.terrestrial-planets` · p. 243 · 1d6 = 5 · **5 terrestrial planets** · count: 5
- [ ] `alien.system.ice-planets` · p. 243 · 1d6+1 = 2 · **2 ice planets** · count: 2
- [ ] `alien.system.ice-planets` · p. 243 · 1d6+1 = 3 · **3 ice planets** · count: 3
- [ ] `alien.system.ice-planets` · p. 243 · 1d6+1 = 4 · **4 ice planets** · count: 4
- [ ] `alien.system.gas-giant-features` · p. 243 · 1d6 = 1 · **Storms** · feature: storms
- [ ] `alien.system.gas-giant-features` · p. 243 · 1d6 = 3 · **Rings** · feature: rings
- [ ] `alien.system.gas-giant-features` · p. 243 · 1d6 = 4 · **High winds** · feature: high-winds
- [ ] `alien.system.asteroid-belt-features` · p. 243 · 1d6 = 4 · **Contains several large dwarf planets** · feature: dwarf-planets
- [ ] `alien.system.asteroid-belt-features` · p. 243 · 1d6 = 5 · **Very wide – covering several orbits** · feature: very-wide

### Family `world` (17 tables, 176 rows)

- [ ] `alien.world.size` · p. 237 · 2d6 = 3-4 · **2,000 km** · diameterKm: 2000, gravity: 0.1 G, gravityClass: low, examples: Iapetus
- [ ] `alien.world.atmosphere` · p. 238 · 2d6 = min-3 · **Thin** · atmosphere: thin, effect: Pressure suit needed. Without one: STAM…
- [ ] `alien.world.atmosphere` · p. 238 · 2d6 = 4-6 · **Breathable** · atmosphere: breathable, effect: Earth density with enough oxygen to liv…
- [ ] `alien.world.terrain` · p. 239 · d66 = 41 · **Impressive river of great length** · terrain: Impressive river of great length
- [ ] `alien.world.terrain` · p. 239 · d66 = 43 · **Mountains cut by sky-blue lakes** · terrain: Mountains cut by sky-blue lakes
- [ ] `alien.world.terrain` · p. 239 · d66 = 51 · **Vast and complex river delta** · terrain: Vast and complex river delta
- [ ] `alien.world.orbital-components` · p. 240 · 2d6 = 5 · **Ring** · component: ring
- [ ] `alien.world.faction-count` · p. 241 · 1d3 = 3 · **Three factions** · count: 3
- [ ] `alien.world.allegiance-arms` · p. 241 · 3d6 = 10-12 · **Government representative** · affiliation: Government representative, affiliationType: government
- [ ] `alien.world.campaign-hook` · p. 242 · d66 = 31 · **Free movement is suddenly restricted, unless the PCs find a way around it.** · hook: Free movement is suddenly restricted, u…

## Presets

### Entity type `alien.character` (25 presets)

- [ ] `alien.npc.android-covert` · p. 258-259 · **Android, covert** · isPC: false, android: true, stress: 0, cash: 0
- [ ] `alien.npc.colony-manager` · p. 258-259 · **Colony manager** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.company-bureaucrat` · p. 258-259 · **Company bureaucrat** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.corporate-exec` · p. 258-259 · **Corporate executive** · isPC: false, android: false, stress: 0, cash: 2000
- [ ] `alien.npc.corporate-killer` · p. 258-259 · **Corporate killer** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.cultist` · p. 258-259 · **Cultist** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.pilot` · p. 258-259 · **Pilot** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.security-guard` · p. 258-259 · **Security guard** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.ships-engineer` · p. 258-259 · **Ship’s engineer** · isPC: false, android: false, stress: 0, cash: 0
- [ ] `alien.npc.squad-leader` · p. 258-259 · **Squad leader** · isPC: false, android: false, stress: 0, cash: 0

### Entity type `alien.creature` (32 presets)

- [ ] `alien.creature.xx121-ovomorph` · p. 212 · **Ovomorph (Egg)** · species: xx121, stage: I, variant: egg, speed: 0, health: 2
- [ ] `alien.creature.xx121-facehugger` · p. 212-214 · **Facehugger** · species: xx121, stage: II, variant: facehugger, speed: 2, health: 2
- [ ] `alien.creature.xx121-royal-facehugger` · p. 212-213 · **Royal Facehugger** · species: xx121, stage: II, variant: royal, speed: 2, health: 3
- [ ] `alien.creature.xx121-chestburster` · p. 215-216 · **Chestburster** · species: xx121, stage: III, variant: chestburster, speed: 2, health: 2
- [ ] `alien.creature.xx121-bambi-burster` · p. 215-216 · **Bambi Burster** · species: xx121, stage: III, variant: bambi-burster, speed: 2, health: 2
- [ ] `alien.creature.xx121-praetorian` · p. 219-221 · **Praetorian** · species: xx121, stage: VI, variant: praetorian, speed: 2, health: 12
- [ ] `alien.creature.neomorph-egg-sacs` · p. 223 · **Neomorphic Egg Sacs** · species: neomorph, stage: I, loreOnly: true, lifecycleTrigger: Release a cloud of motes when…, containment: Fire destroys them; liquid ni…
- [ ] `alien.creature.neomorph-neophyte` · p. 225 · **Neophyte (Juvenile Neomorph)** · species: neomorph, stage: IV, variant: neophyte, speed: 3, health: 4
- [ ] `alien.creature.neomorph-adult` · p. 224-225 · **Adult Neomorph** · species: neomorph, stage: V, variant: adult, speed: 2, health: 6
- [ ] `alien.creature.engineer` · p. 204-207 · **Engineer** · species: engineer, stage: adult, loreOnly: true

### Entity type `alien.faction` (20 presets)

- [ ] `alien.faction.icc` · p. 171 · **Interstellar Commerce Commission** · factionType: other, allegiance: independent, history: After disease outbreaks on st…, products: Spacedock inspections, cargo …, military: Inspection teams and coast gu…
- [ ] `alien.faction.weyland-yutani` · p. 172-174 · **Weyland-Yutani** · factionType: corporation, allegiance: 3we, history: Born at the turn of the centu…, products: Synthetics, spaceships, compu…, military: The Dog Catchers: commando te…
- [ ] `alien.faction.seegson` · p. 176-177 · **Seegson** · factionType: corporation, allegiance: independent, history: Founded as Sieg and Son in th…, products: Security and communications, …, leaders: A publicly traded company run…
- [ ] `alien.faction.chigusa-corporation` · p. 162 · **Chigusa Corporation** · factionType: corporation, allegiance: unknown, products: colonization, plasma harvesti…, reputation: 0, minor: true
- [ ] `alien.faction.hyperdyne-systems` · p. 162 · **Hyperdyne Systems** · factionType: corporation, allegiance: icsc, products: synthetics, cybernetic prosth…, reputation: 0, minor: true
- [ ] `alien.faction.jingti-long` · p. 162 · **Jĭngtì Lóng Corporation** · factionType: corporation, allegiance: icsc, products: colonization, weapons R&D, reputation: 0, minor: true
- [ ] `alien.faction.kelland-mining` · p. 162 · **Kelland Mining Company** · factionType: corporation, allegiance: unknown, products: deep space mining, reputation: 0, minor: true
- [ ] `alien.faction.koorlander-corp` · p. 162 · **Koorlander Corp** · factionType: corporation, allegiance: unknown, products: tobacco, reputation: 0, minor: true
- [ ] `alien.faction.souta-corp` · p. 162 · **Souta Corp** · factionType: corporation, allegiance: unknown, products: beer, reputation: 0, minor: true
- [ ] `alien.faction.lockmart` · p. 162 · **Lockmart** · factionType: corporation, allegiance: icsc, products: commercial starships, reputation: 0, minor: true

### Entity type `alien.item` (89 presets)

- [ ] `alien.item.m240-incinerator-unit` · p. 86 · **M240 Incinerator Unit** (weapon) · bonus: 1, damage: 2, damageType: fire, rangeMin: short, range: short
- [ ] `alien.item.25mm-gatling-gun` · p. 313 · **25 mm Gatling Gun** (weapon) · bonus: 1, damage: 4, damageType: normal, rangeMin: medium, range: extreme
- [ ] `alien.item.light-armor-vest` · p. 90 · **Kevlar Riot Vest** (armor) · armorRating: 1, weight: 0.5, cost: 600
- [ ] `alien.item.apesuit` · p. 90 · **Weyland-Yutani APEsuit** (armor) · armorRating: 1, weight: 1, cost: 5000, airSupply: 4, effect: Armor level 3 against acid; p…
- [ ] `alien.item.samani-e-series-watch` · p. 93 · **Samani E-Series Watch** (tool) · weight: 0, cost: 50, effect: Tracks time, oxygen and press…
- [ ] `alien.item.motion-tracker` · p. 96 · **M314 Motion Tracker** (tool) · weight: 1, cost: 1200, effect: Detects movement while in ste…, power: 5, range: long
- [ ] `alien.item.m316-motion-tracker` · p. 96 · **M316 Motion Tracker** (tool) · weight: 0, cost: 3000, effect: Detects movement while in ste…, power: 3, range: medium
- [ ] `alien.item.neuro-visor` · p. 96 · **Neuro Visor** (tool) · weight: 1, cost: 10000, effect: Monitor or talk to a hypersle…, power: 5, range: long
- [ ] `alien.item.automed` · p. 97 · **AutoDoc** (medical) · weight: 0, cost: 500000, portable: false, effect: Gives first aid with MEDICAL …
- [ ] `alien.item.purified-water` · p. 99 · **Water Bottle** (food) · weight: 0.25, cost: 2, costText: $2–$100, effect: Covers water for one day.

### Entity type `alien.location` (151 presets)

- [ ] `alien.location.new-eden-sector` · p. 182 · **New Eden Sector** (sector) · region: core, allegiance: icsc, description: Guarded by the ICSC's corpora…
- [ ] `alien.location.sector-117` · p. 201 · **Sector 117** (sector) · allegiance: unknown, description: Many colony missions launched…
- [ ] `alien.location.17-phei-phei` · p. 187 · **17 Phei Phei** (star-system) · region: outer-veil, allegiance: upp, starNote: Main sequence star, description: Ancient collisions reduced so…
- [ ] `alien.location.nn3325` · p. 263 · **NN3325** (star-system) · region: outer-rim, allegiance: unknown, publicKnowledge: The system is barren., secret: Devil's Peak is hidden here.
- [ ] `alien.location.hip53020` · p. 265 · **HIP53020** (star-system) · region: outer-rim, allegiance: uas, publicKnowledge: An ordinary system., secret: W-Y is secretly exploiting En…
- [ ] `alien.location.earth` · p. 180 · **Earth** (planet) · planetType: terrestrial, inhabited: true, region: core, affiliation: United Americas, Three World …, description: Saved by terraforming at home…
- [ ] `alien.location.titan` · p. 180 · **Titan** (planet) · planetType: terrestrial, inhabited: true, region: core, allegiance: 3we, affiliation: Three World Empire
- [ ] `alien.location.bethlehem` · p. 265 · **Bethlehem** (colony) · allegiance: 3we, description: On a world known only for vio…
- [ ] `alien.location.anchorpoint-tower-four` · p. 113 · **Tower Four Garrison Office** (site) · description: A small contingent of Colonia…
- [ ] `alien.location.orbital-collector-v-23` · p. 182 · **Orbital Collector V-23** (site) · description: Collects energy from floating…

### Entity type `alien.spaceship` (7 presets)

- [ ] `alien.spaceship.lockmart-starcub-shuttle` · p. 128 · **Starcub Shuttle** · shipClass: C, designation: Intrasystem Vessel, manufacturer: Lockmart, cost: 2260000, crew: 1
- [ ] `alien.spaceship.weyland-yutani-cm-93d-mule` · p. 130 · **Model CM-93D Mule** · shipClass: G, designation: Commercial Ore Transport Vess…, manufacturer: Weyland-Yutani, cost: 13325000, crew: 3
- [ ] `alien.spaceship.lockmart-cm-90s-corvus` · p. 133 · **Model CM-90S Corvus** · shipClass: G, designation: Commercial Deep Space Salvage…, manufacturer: Lockmart, cost: 18350000, crew: 6
- [ ] `alien.spaceship.bison-m-class-hauler` · p. 134 · **Model CM-88G Bison** · shipClass: M, designation: Commercial Starfreighter, manufacturer: Lockmart, cost: 38300000, crew: 7
- [ ] `alien.spaceship.lockmart-cm-88h-bison` · p. 135 · **Model CM-88H Bison** · shipClass: M, designation: Commercial Starfreighter, manufacturer: Lockmart, cost: 45500000, crew: 7
- [ ] `alien.spaceship.lockmart-cyg-ns3-star-clipper` · p. 136 · **Model CYG-NS3 Star Clipper** · shipClass: M, designation: Commercial Transport Ship, manufacturer: Lockmart, cost: 62475000, crew: 6
- [ ] `alien.spaceship.conestoga-class-troop-transport` · p. 137 · **Conestoga-Class Frigate** · shipClass: R, designation: Rapid Response Troop Transpor…, manufacturer: Weyland-Yutani, cost: 738150000, crew: 12

### Entity type `alien.vehicle` (6 presets)

- [ ] `alien.vehicle.weyland-nr-9-atv` · p. 100 · **Weyland NR-9 Series All Terrain Vehicle** · encountered: Frontier colonies, length: 3.2 m, passengers: 1, maneuverability: 2, speed: 2
- [ ] `alien.vehicle.daihotai-tractor` · p. 101 · **Daihotai Series 8×8 Tractor** · encountered: Frontier colonies, length: 6.6 m, passengers: 4, maneuverability: 0, speed: 2
- [ ] `alien.vehicle.m577-apc` · p. 102 · **M570 Series Armored Personnel Carrier** · encountered: USCMC battlefields and milita…, length: 9.2 m, passengers: 13, maneuverability: 1, speed: 3
- [ ] `alien.vehicle.aerodyne-gyrocar` · p. 103 · **Aerodyne Light VTOL Automotive Gyrocar** · encountered: Densely populated Core and Ou…, length: 5.2 m, passengers: 5, maneuverability: 3, speed: 3
- [ ] `alien.vehicle.ud-4l-cheyenne-dropship` · p. 104 · **UD-4 Cheyenne Series VTOL Tactical Dropship** · encountered: USCMC battlefields and milita…, length: 25.2 m, passengers: 15, maneuverability: 2, speed: 4
- [ ] `alien.vehicle.wy-37b-cargo-lifter` · p. 105 · **Weyland-Yutani WY-37B Cargo Lifter Transport Sled** · encountered: Frontier colonies, starfreigh…, length: 34.2 m, passengers: 3, maneuverability: -1, speed: 3

## Reference lists

### `alien.careers` Careers (9 items, p. 31-39)

- [ ] `colonial-marine` · p. 31 · **Colonial Marine** · A USCMC grunt who signed up young; the shine of the Corps is wearing off.
- [ ] `colonial-marshal` · p. 32 · **Colonial Marshal** · An incorruptible frontier lawman with enemies on both sides of the law.
- [ ] `company-agent` · p. 33 · **Company Agent** · A hungry corporate climber sent to the Frontier to find the next big score.
- [ ] `kid` · p. 34 · **Kid** · A frontier child who never asked for this life and makes fun out of nothing.
- [ ] `medic` · p. 35 · **Medic** · The one with the bandages and adrenaline shots, jaded by frontier medicine.
- [ ] `officer` · p. 36 · **Officer** · The authority figure and crew advocate everyone mocks until things go wrong.
- [ ] `pilot` · p. 37 · **Pilot** · A thrill-seeking flyer who will take any craft anywhere for the rush.
- [ ] `roughneck` · p. 38 · **Roughneck** · The hard-working, hard-partying manual laborer who keeps the Frontier running.
- [ ] `scientist` · p. 39 · **Scientist** · A researcher one thesis from recognition, driven by knowledge above people.

### `alien.critical-injuries` Critical injuries (36 items, p. 70)

- [ ] `ci-22` · p. 70 · **Broken Toes**
- [ ] `ci-25` · p. 70 · **Impaled Thigh**
- [ ] `ci-26` · p. 70 · **Slashed Shoulder**
- [ ] `ci-34` · p. 70 · **Injured Throat**
- [ ] `ci-45` · p. 70 · **Bleeding Gut**
- [ ] `ci-54` · p. 70 · **Leg Arterial Bleeding**
- [ ] `ci-61` · p. 70 · **Ruptured Jugular**
- [ ] `ci-62` · p. 70 · **Internal Bleeding**
- [ ] `ci-63` · p. 70 · **Massive Hemorrhage**
- [ ] `ci-66` · p. 70 · **Impaled Heart**

### `alien.frames` Campaign frames (3 items, p. 234-235)

- [ ] `space-truckers` · p. 234 · **Space Truckers** · The crew of a tug or cargo hauler, working for the ship's owner and hauling wha…
- [ ] `colonial-marines` · p. 235 · **Colonial Marines** · A small squad whose PCs are the leaders making the calls. Orders come down the …
- [ ] `frontier-colonists` · p. 235 · **Frontier Colonists** · Surveyors, prospectors and explorers on the Outer Rim, chasing raw materials an…

### `alien.mental-traumas` Mental traumas (18 items, p. 74)

- [ ] `reclusive` · p. 74 · **Reclusive**
- [ ] `alcoholic` · p. 74 · **Alcoholic**
- [ ] `depressed` · p. 74 · **Depressed**
- [ ] `worrisome` · p. 74 · **Worrisome**
- [ ] `speech-loss` · p. 74 · **Speech Loss**
- [ ] `flashbacks` · p. 74 · **Flashbacks**
- [ ] `panic-attacks` · p. 74 · **Panic Attacks**
- [ ] `violent` · p. 74 · **Violent**
- [ ] `psychotic` · p. 74 · **Psychotic**
- [ ] `amnesiac` · p. 74 · **Amnesiac**

### `alien.minor-corporations` Minor corporations (10 items, p. 162)

- [ ] `alphatech-hardware` · p. 162 · **Alphatech Hardware** · A major military contractor supplying the UA and other corporations.
- [ ] `chigusa-corporation` · p. 162 · **Chigusa Corporation** · A Weyland-Yutani rival in colonization, plasma harvesting and mining.
- [ ] `gemba-systec` · p. 162 · **Gemba Systec** · Makes electronics and handles freight.
- [ ] `hyperdyne-systems` · p. 162 · **Hyperdyne Systems** · An ICSC subsidiary of Weyland-Yutani building high-end synthetics and cyberneti…
- [ ] `jingti-long` · p. 162 · **Jĭngtì Lóng Corporation** · An ICSC rival of Weyland-Yutani and Seegson in colonization and weapons researc…
- [ ] `kelland-mining` · p. 162 · **Kelland Mining Company** · A deep space mining company that builds huge orbital mining stations.
- [ ] `koorlander-corp` · p. 162 · **Koorlander Corp** · Grows tobacco on several colonies; its cigarettes compete with Balaji Imperial.
- [ ] `souta-corp` · p. 162 · **Souta Corp** · Brews Souta Dry, the cheap alternative to Weyland-Yutani's Aspen Beer.
- [ ] `lockmart` · p. 162 · **Lockmart** · An ICSC company and the leading builder of commercial starships.
- [ ] `steer-city-cattle-company` · p. 162 · **Steer City Cattle Company** · A small outfit supplying draft animals and quality meat to Frontier colonies.

### `alien.ship-armaments` Ship armaments (12 items, p. 124-126)

- [ ] `short-lance-asat-missile` · p. 125 · **Short Lance ASAT Missile** · Guided anti-ship missile; slow enough to be shot down or decoyed. Missiles sold…
- [ ] `light-railgun-turret` · p. 125 · **Light Railgun Turret** · Close-defense gun firing heavy rounds; inaccurate but deadly up close.
- [ ] `medium-railgun-turret` · p. 125 · **Medium Railgun Turret** · Close-defense gun firing heavy rounds; inaccurate but deadly up close.
- [ ] `heavy-railgun-turret` · p. 125 · **Heavy Railgun Turret** · Close-defense gun firing heavy rounds; inaccurate but deadly up close.
- [ ] `particle-beam-400mev` · p. 125 · **400MeV Particle Beam Weapon** · Ignores countermeasures; -1 damage per range category past Contact; component d…
- [ ] `orbital-mines` · p. 125 · **Orbital Mines** · Cheap short-range defense against boarders; mines bought individually.
- [ ] `tactical-nuke` · p. 125 · **Tactical Nuke** · Orbit-to-surface warhead that flattens a colony; its high burst also causes EMP…
- [ ] `sensor-decoys` · p. 125 · **Sensor Decoys** · False radar returns that confuse weapons.
- [ ] `sensor-drones` · p. 125 · **Sensor Drones** · Fast decoy drones that draw off missiles and railgun targeting.
- [ ] `ciws-laser-array` · p. 125 · **CIWS Laser Array** · Close-in laser array that shoots down missiles and even railgun rounds.

### `alien.ship-classes` Ship classes (7 items, p. 121)

- [ ] `C` · p. 121 · **Class C** · 15 m, crew 1–2, hull 2. Hardpoints: —. Modules: 2 × size II, 4 × size I.
- [ ] `G` · p. 121 · **Class G** · 50 m, crew 3–6, hull 5. Hardpoints: 1 × size II, 2 × size I. Modules: 3 × size …
- [ ] `J` · p. 121 · **Class J** · 150 m, crew 4–10, hull 6. Hardpoints: 2 × size II, 3 × size I. Modules: 4 × siz…
- [ ] `M` · p. 121 · **Class M** · 300 m, crew 6–12, hull 9. Hardpoints: 1 × size III, 2 × size II. Modules: 4 × s…
- [ ] `R` · p. 121 · **Class R** · 700 m, crew 12–18, hull 12. Hardpoints: 2 × size III, 4 × size II. Modules: 5 ×…
- [ ] `U` · p. 121 · **Class U** · 1,200 m, crew 15–20/2,000, hull 15. Hardpoints: 3 × size III, 6 × size II. Modu…
- [ ] `X` · p. 121 · **Class X** · 2,500 m, crew 36–72/10,000, hull 20. Hardpoints: 5 × size III, 10 × size I. Mod…

### `alien.ship-modules` Ship modules (40 items, p. 122-125)

- [ ] `artificial-intelligence-i` · p. 122-124 · **Artificial Intelligence I** · Ship mainframe that can run the vessel while the crew sleeps; priced as the mod…
- [ ] `air-scrubbers-ii` · p. 122-124 · **Air Scrubbers II** · Life support that cleans the air and makes oxygen.
- [ ] `air-scrubbers-iii` · p. 122-124 · **Air Scrubbers III** · Life support that cleans the air and makes oxygen.
- [ ] `cargo-bay-i` · p. 122-124 · **Cargo Bay I** · Internal hold with loading doors; bigger bays get H-frame cranes.
- [ ] `cargo-bay-ii` · p. 122-124 · **Cargo Bay II** · Internal hold with loading doors; bigger bays get H-frame cranes.
- [ ] `cargo-bay-v` · p. 122-124 · **Cargo Bay V** · Internal hold with loading doors; bigger bays get H-frame cranes.
- [ ] `galley-iv` · p. 122-124 · **Galley IV** · Kitchen, refrigeration and coffee maker.
- [ ] `hangar-ii` · p. 122-124 · **Hangar II** · Lets smaller ships land inside, through airlocks.
- [ ] `hangar-iv` · p. 122-124 · **Hangar IV** · Lets smaller ships land inside, through airlocks.
- [ ] `vehicle-bay-iv` · p. 122-124 · **Vehicle Bay IV** · Garage and loading ramp for ground vehicles.

### `alien.ship-upgrades` Ship upgrades (15 items, p. 127)

- [ ] `added-hardpoint-ii` · p. 127 · **Added Hardpoint, size II** · One extra hardpoint, no bigger than the ship's largest. Two purchases at most.
- [ ] `added-hardpoint-iii` · p. 127 · **Added Hardpoint, size III** · One extra hardpoint, no bigger than the ship's largest. Two purchases at most.
- [ ] `armored-bulkheads` · p. 127 · **Armored Bulkheads** · Each purchase adds 1 armor level, to a maximum of 3. Unupgraded ships count as …
- [ ] `boosted-displacement-drives` · p. 127 · **Boosted Displacement Drives** · FTL rating one step lower (faster) per purchase.
- [ ] `external-module-ii` · p. 127 · **External Module, size II** · Outside fittings for one more module (bought separately), no bigger than the la…
- [ ] `external-module-iv` · p. 127 · **External Module, size IV** · Outside fittings for one more module (bought separately), no bigger than the la…
- [ ] `external-module-v` · p. 127 · **External Module, size V** · Outside fittings for one more module (bought separately), no bigger than the la…
- [ ] `overpowered-thrusters` · p. 127 · **Overpowered Thrusters** · +1 Thrusters per purchase.
- [ ] `planetfall-capacity` · p. 127 · **Planetfall Capacity** · The ship can enter atmosphere and land (p. 109).
- [ ] `stealth-technology` · p. 127 · **Stealth Technology** · Run dark without shutting down engines or sensors (p. 141); Signature -2.

### `alien.skills` Skills (12 items, p. 42-47)

- [ ] `closeCombat` · p. 46 · **Close Combat** · Attack someone up close, armed or unarmed.
- [ ] `stamina` · p. 46 · **Stamina** · Test physical endurance: survive vacuum, resist contagion, make death rolls.
- [ ] `rangedCombat` · p. 46 · **Ranged Combat** · Fire any kind of ranged weapon.
- [ ] `mobility` · p. 46 · **Mobility** · Acrobatic or risky movement: dangerous climbs, jumps and dodges.
- [ ] `piloting` · p. 46 · **Piloting** · Hard manoeuvres at the helm of any spacecraft; also drives ground vehicles.
- [ ] `observation` · p. 46 · **Observation** · Spot sneaking enemies, search zones and size up unknown threats.
- [ ] `comtech` · p. 46 · **Comtech** · Program, repair, decrypt or manipulate computers and comms gear.
- [ ] `manipulation` · p. 47 · **Manipulation** · Make someone see things your way; affected by negotiating position.
- [ ] `command` · p. 46 · **Command** · Stop panic in other PCs and give orders in combat.
- [ ] `medicalAid` · p. 47 · **Medical Aid** · Give first aid to the dying and make medical examinations.

### `alien.talents` Talents (56 items, p. 48-51)

- [ ] `cunning` · p. 50 · **Cunning** · Roll Manipulation with Wits instead of Empathy.
- [ ] `nimble` · p. 50 · **Nimble** · Push Agility-based skill rolls twice; +1 stress per push.
- [ ] `surgeon` · p. 50 · **Surgeon** · +2 dice to Medical Aid when treating a critical injury that requires surgery.
- [ ] `pull-rank` · p. 50 · **Pull Rank** · Order non-officer NPCs of your own organization with Command; on a success they…
- [ ] `full-throttle` · p. 50 · **Full Throttle** · +2 dice to Piloting a spacecraft when accelerating or decelerating.
- [ ] `combat-veteran` · p. 51 · **Combat Veteran** · In combat you may keep last round's initiative card instead of drawing a new on…
- [ ] `hardened` · p. 51 · **Hardened** · +1 maximum Health. Can be taken up to three times.
- [ ] `second-wind` · p. 51 · **Second Wind** · Anyone trying to rally you gets +2 dice to the Command roll.
- [ ] `weapon-specialist` · p. 51 · **Weapon Specialist** · +2 dice with one chosen weapon model, or unarmed; take it again for another mod…
- [ ] `zero-g-training` · p. 51 · **Zero-G Training** · Ignore all skill roll penalties for zero gravity.
