# Alien RPG (Evolved Edition)

[Campaign Forge](../../README.md) · [App features](app.md) · [Alien RPG](alien.md) · [Fifth edition](dnd5e.md) · [Remaster (ORC)](orc.md)

The `alien` module (`packages/module-alien`): a companion to the Free League rulebook, not a replacement. It encodes structure, tables and mechanics as data and cites the page; it does not reproduce the book's prose or art. The data has been checked against the printed Evolved Edition core rules; [`docs/verification/`](../verification/README.md) records what was corrected.

Demos: *Skyfire Down* (campaign play, with an infection under way, the crew's long-term agendas one job in, a job board whose taken posting has three NPCs, a betrayer and a generated site map, and four players, one note shared with one of them) and *Cold Harbor Relay* (a cinematic one-shot built with the guided builder, with a generated site map, duct levels and live map state ready for session 1).

## What it adds

- **Guided adventure builder.** A step-by-step cinematic scenario builder (basics, situation, cast, locations and puzzles, three acts, review) with a field guide and page references on every step.
- **Agenda drafts.** A generator for cinematic play (no AI) that deals each PC one of 24 original three-act arcs (The Plant, The Debtor, The Protector, The Hidden Synthetic, The Mutineer…) weighted by a betrayal dial (loyal crew, frayed, knives out), and fills every slot from the campaign: who they answer to (the Company the adventure names, a rival corporation, the marshals, family, a belief, a synthetic's directive…), why, an objective per act aimed at the adventure's PCs (buddies and rivals), NPCs, key items, locations and site map rooms (fallbacks such as "the specimen" when the campaign has none), who to keep it from, and a catch. Objectives escalate from quiet in Acts 1-2 to open in Act 3 and aim at the climax, and each act notes how pursuing it earns the act's Story Point (risk or sacrifice, p. 158). A conflict check scores every pair (opposed objectives on the same target, competing masters, rivals), caps the party at one Hidden Synthetic and one Company plant, wants every PC in a clash and enough friction, and re-deals (seeded) when the deal fails, reporting each try. The drafts are marked DRAFT: re-roll or pin any slot, lock an arc, edit the text, then *Accept agendas* writes them onto each PC's sheet and the adventure's agenda cards, asking before it replaces text you wrote. Open it from the guided builder's PCs step or the Generate page.
- **Campaign agendas.** The campaign-play counterpart (no AI): each PC gets a long-term personal goal that lasts several jobs (24 original goals such as A stake in a ship, Union card, Make amends, The captain's chair), who they answer to, why, an embarrassing secret, and a fresh beat on every job: one concrete thing to do at a personal cost, with the bonus XP it can earn (p. 27, 30). The goal's one line stays on the sheet as the personal agenda, so the XP question and shore leave's Pursue Agenda (p. 257) keep working. Open friction lines, dealt by a friction dial (calm, simmering, prickly) and weighted per crew, tell every player whom they clash with and over what: competing for pay, berths and gear, clashing loyalties, embarrassing secrets that endanger no one, and buddies and rivals from the sheets. Friction, never betrayal: every goal, beat, line, secret and tension step is tagged level 0-1, and a no-betrayal check (no stance against a crewmate, no dangerous secret, tension under its cap, everyone in a clash, nobody the target of everything) plus a banned-words scan runs on every deal. Accepting writes each goal onto the sheet, a GM-only agenda handout and a players' friction handout per PC. After each job (in the session wrap-up, or *Deal next beats* on a PC's Agenda tab) mark each goal advanced, stalled or resolved: the next beat is dealt, a stall raises the tension one step (quiet disagreement, open argument, hard words, and no further), a resolved goal draws a follow-up that fits it, and the handouts update. A rule card covers agendas in campaign play and friction, not betrayal; the GM screen has an Agendas and friction panel.
- **Agendas reach their players.** In a player packet (*Share with players → Player packets*) each PC's player gets the sheet they play from (stats, stress, health, gear, XP, conditions) and their personal agenda with the campaign agenda's goal, this job's beat and the tension, even though all of it stays GM-only for everyone else; the agenda's embarrassing secret and history, the android box, the secret synthetic and NPC dossier fields and the other PCs' agendas stay out. A cinematic agenda card goes to its player once the GM ticks *Give to <player>* on it (on the act's handouts or the guided builder's PCs step), so each act's agenda can be handed out when that act starts. The open friction handouts already go to everyone.
- **Job board.** Between jobs, deal one to six postings (campaign play, no AI): each is a job rolled exactly as the Job Generator rolls it (p. 244-252), dressed as the players read it (an original title, pitch, pay and terms, who posted it and where, deadline, stated requirements such as "Own ship required" or "No questions", and a risk rating that follows the difficulty but may undersell or oversell it), with the GM's side kept apart: the complications, the plot twist and what the employer really wants. An employer bias prefers corporations, governments or others; a confidential client stays GM-only. Each job comes with one NPC per point of difficulty (the book's D3, so up to three): the contact first, then roles weighted by frame and job (insider, rival crew lead, survivor, company liaison, stowaway, specialist, android), each with a name from the careers' lists, a stat line from the book's typical NPCs, a want, a secret, a tie to the job and a GM-only agenda that may betray the crew, reusing the agenda generator's arcs (The Plant, The Double Agent, The Hidden Synthetic…) plus original ones (The Setup, The Claim Jumper, The Informer). An NPC treachery dial (none, rare, common) weights them; the contact betrays less often; a job holds at most one hidden synthetic, whose android make stays GM-only. Every betrayer makes the job play one difficulty lower at its site (at least 1): the job shows "Difficulty 3 (plays as 2: one betrayer)". Each posting, and each part of it, re-rolls or pins on its own; take one (or keep several as leads) and the job, its employer, its NPCs (the contact visible to the players, the rest GM-only until met) and a players' posting handout are added. The job page lists its people, the handout and its site brief.
- **Site briefs and rogue humans.** Every board job carries a site brief for the map generator, read from its rolls: the site type from the destination and mission, size, decks and a threat budget from the effective difficulty, and a threat mix of xenomorphs, other creatures and rogue humans chosen from the mission, destination, complications and twist, plus hazards, win paths, key rooms and the job's NPCs (a betrayer marked to turn in Act 3). *Generate site map* opens the generator with the brief and saves the map with the job's site. Rogue humans are hostile groups built from the book's typical NPCs (a mercenary team, a UPP fire team, corporate security, a company cleaner, desperate colonists, cultists, claim jumpers, a hostile android) with a tier and cost against the act budget; they hold rooms, patrol corridors or guard the objective, never hide in ducts (androids may), appear on the GM map and in the zone key with their stat line, and never on the player map, its prints or a share.
- **Combat.** Creature turns roll or pick the creature's signature attack, rank targets by range from the live map and roll the attack dice; damage tracking with health bars, armor and broken PCs; reactions such as acid splash; special attacks (disarm, shove, grapple and more) with opposed rolls. Creature rolls stay GM-only.
- **Weapons on the character sheet.** A Weapons section beside Gear lists each weapon with its stat line as the gear tables print it (modifier, damage with E, stun or fire, range, ammo or power, features, weight), and the weapons count toward encumbrance with the gear. *Add weapon* opens a searchable picker of the book's personal weapons grouped ranged, melee and explosive (vehicle-mounted guns left out), each with modifier, damage, range, weight, cost and page; picking one copies its stats onto the sheet. *From campaign items* links a weapon item from the Atlas, and *Custom weapon* adds a row to fill in. A new PC or NPC created in the Atlas can pick starting weapons before it is saved. At the table, *Attack with …* (Dice tab, or the PC card's Attack button) rolls Close Combat at Adjacent range and Ranged Combat beyond, with the weapon's modifier and −2 per band inside its minimum range, shows the damage with extra successes, and applies the hit to a creature or NPC through its armor (armor piercing, stun and fire included); entered dice work too.
- **Ship and money.** A Ship page for campaign play: the crew's ship with its hull, component damage, spare parts, provisions, cargo and upkeep; crew funds summed from a ledger (add entries, filter by category, running balance, CSV export); a travel planner that works out FTL time and the checks on arrival, then departs, rolls them and moves the in-world date; one-click job payments; and a Between jobs procedure for the pay, the lease, repairs and spare parts, food and water, then shore leave and the next job. Categories the book prices cite their page; docking, fuel and loans are plain GM bookkeeping.
- **Character progression.** An end-of-session award checklist in the wrap-up (the nine XP questions, one column per PC, totals, then Award) and Story Points per act in cinematic play; a Progression tab on each PC with the XP pool, Story Points, lifetime totals and a full history; Spend XP with the book's costs, the level 5 cap, career and general talents, stacking limits and the conditions for a new skill, shown with the dice pool before and after; undo of the last spend; Story Points spent at the table from the PC card or on a roll (one base die becomes a success). Every award and spend is logged per character and travels in the export bundle.
- **Site maps.** A seeded deck-plan generator that reads the adventure's locations, puzzles and crew, draws a floor plan in the shape of the site type (a starship's long spine, a derelict's broken hull, a station's ring, a colony's cluster of prefabs, a mine's winding adit, a lab's wings round an atrium, a ruin's great chambers), checks the map against the zone rules, and produces a GM map, a player map (fogged in play, whole in print), a tracking map, a zone key and a distance table. At the table the GM reveals zones, locks and seals doors, marks fires and pings the tracker; the player screen shows only what the crew has seen.
- **Duct levels.** Ducts are generated as separate maze sheets with labelled exits, shafts between levels, hazards and a GM-only duct event table rolled from table mode.
- **GM screen.** Rolls and pushing, stress and panic (with the stress response and panic tables) and combat and damage on the GM side; your turn, gear and supply, and stress and recovery on the player side; hints, critical injuries, hazards and xenomorphs as extras; Story Points in cinematic play. Every block is one of the module's verified paraphrases with its page.
- **Wide-format printing.** Site maps print on 24" or 36" rolls as vector PDFs at 1 inch per metre (28mm miniatures), 28mm true scale or an overview scale, with a title block, scale bar and optional 1 m grid squares.

The app-wide features (table mode, hints, generators, sharing, booklets) work with this module too; see [App features](app.md).

## Screenshots

**Guided adventure builder**: the cinematic scenario steps with the field guide and what still needs fixing.

![Guided adventure builder](../screenshots/guided-builder.png)

**Agenda drafts**: the party's arcs dealt from the Cold Harbor adventure with the conflict report (friction per pair, the caps, the re-deals), then each PC's three acts as editable drafts whose slots re-roll or pin one by one.

![Agenda drafts with the conflict check](../screenshots/agenda-generator.png)

**Agenda cards**: one cut-out card per character per act, four to a page with crop marks, handed to each player as the act begins.

![Agenda cards](../screenshots/agenda-cards.png)

**Campaign agendas**: a Skyfire Down PC's Agenda tab one job in: the long-term goal and this job's beat (GM only), the tension after a stalled job, the beats so far, and the open friction lines the players see.

![Campaign agendas: a PC's goal, beat, tension and open friction](../screenshots/alien-campaign-agendas.png)

**Job board**: the Skyfire Down job taken from the board: its posting as the players read it, the GM's side (it plays as difficulty 2: one betrayer), its three NPCs (only the contact visible to the players), the players' posting handout and the site brief with its generated map.

![Job board: a taken posting with its NPCs and site brief](../screenshots/alien-job-board.png)

**Creature turns**: roll or choose a creature's signature attack, pick a target by range from the live map, roll the dice and apply the damage; armor, acid splash and broken rolls are worked out for you, all GM-only.

![Creature turn](../screenshots/creature-turn.png)

**Add weapon**: the picker on a PC's sheet, grouped ranged, melee and explosive, with each weapon's modifier, damage, range, weight, cost and page; one click copies the stat line into the sheet's Weapons section.

![Add weapon picker](../screenshots/alien-weapons.png)

**Ship and money**: the crew's ship and its state, crew funds summed from the ledger, Between jobs, and the travel planner with the days, NDD rolls, hypersleep and food the trip calls for.

![Ship page](../screenshots/ship.png)

**Wrap-up awards**: the nine end-of-session XP questions for every PC at once, with attendance ticked, questions that do not apply greyed out (no buddy, no rival) and each PC's new total before posting.

![Wrap-up award checklist](../screenshots/wrap-up-awards.png)

**Progression and Spend XP**: a PC's XP pool and history beside the Spend XP panel, with each skill's cost, its dice before and after, and the condition a new skill needs.

![Progression tab with Spend XP](../screenshots/progression.png)

**Site map generator**: the brief is filled from the adventure (key rooms, puzzles, NPCs) and every map is checked against the zone rules.

![Site map generator](../screenshots/map-generator.png)

**GM map**: zone numbers, ducts, spawns, clues, hazards, locks and act shading, with the legend and the rule each symbol carries.

![GM map](../screenshots/site-map-gm.png)

**Player map**: the same deck with every GM detail removed; it prints whole at 1 m = 1 cm, and at the table the player screen adds fog.

![Player map](../screenshots/site-map-player.png)

**Site types**: each site type has its own floor plan from the same brief: a starship along one spine, a derelict with breached and collapsed sections, a station ring round a hub, colony prefabs on open yards, a mine's winding adit, a lab's mirrored wings behind decon locks, and a ruin's great halls joined by galleries.

![Site types](../screenshots/site-types.png)

**Duct level**: each deck's ducts are generated as their own maze sheet, with runs, junctions, vent chambers and shafts that climb or drop between levels. Exits are labelled with the room they open into, generated hazards (vent fans, steam, flooding, collapses, drops) sit in the maze, and a GM-only duct event table rolls encounters, dangers and moments of respite at the table. Players see a duct zone only once the crew reaches it.

![Duct level](../screenshots/duct-map.png)

**Roll print**: a 36" wide-format vector PDF at 1 inch per metre for 28mm miniatures, turned to fit the roll with all text upright, with a title block, 5 m scale bar and zone key in the margin. Decks too wide for the roll split into overlapping strips with cut lines.

![Roll print](../screenshots/roll-print.png)

## Licence

Alien is the property of 20th Century Studios, licensed to Free League Publishing. This project contains structure and short paraphrased reference data intended for owners of the rulebook. It is not affiliated with or endorsed by either company. Review `docs/architecture-seed.md` (section "Risks, open questions, and licensing") before any public release.
