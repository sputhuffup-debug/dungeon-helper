/**
 * "Your first ORC campaign": the module's guide (`GameModule.guide`), a
 * walkthrough from a new campaign in campaign play to the end of session 1.
 * It makes the party (one character with the builder, one by hand, the
 * players), a settlement with a place inside it and a rolled village with its
 * tavern, three NPCs (a Monster Core stat block, the NPC generator, by hand),
 * connects them (relationships, @ links and backlinks, the graph, who sees
 * what), turns a rumour from the quest board into an adventure from a
 * template with an encounter and a generated dungeon, then plans, plays and
 * wraps up the session.
 *
 * The app shows it on the Guide page; `pnpm guides` writes the same text to
 * docs/guides/pf2e-orc-first-campaign.md. Every step's image is taken by the
 * screenshot script (apps/web/screenshots/readme.spec.ts, "guide-pf2e-orc"),
 * which performs these steps in the app with the names used here.
 *
 * Original wording, written for Campaign Forge, with no setting names; the
 * example campaign (the Wardens of Mossford, Ilsa Varrow, Tamsin Reed,
 * Mossford, the Ferryman's Rest, Ivyford, the Merry Crow, Bram Oakhollow,
 * Corin Dale, Hesper Quill, Odalys Brand, the Crowfoot Warren) is invented
 * for it. Citations are the module's own (book and section). `*Label*` marks
 * a button or label exactly as the app shows it.
 */
import type { GuideDef, GuideStepDef } from "@campaign-forge/module-sdk";
import { CHARACTER, cite, CREATURE, id, LIST, LOCATION, NPC, preset, QUEST } from "../ids.ts";

export const FIRST_CAMPAIGN_GUIDE_ID = id("first-campaign");

const SETTLEMENT = id("proc.settlement");
const NPC_GENERATOR = id("proc.npc");
const ENCOUNTER_BUILDER = id("proc.encounter");
/** The citation the encounter builder and the dungeon generator carry. */
const BUILDING_ENCOUNTERS = cite("GM Core", "Building Encounters");

/** A quest on the quest board, for the "Open the quest" link (hidden until there is one). */
const aQuest = { "==": [{ var: "type" }, QUEST] };

const step = (s: GuideStepDef): GuideStepDef => s;

export const firstCampaignGuide: GuideDef = {
  id: FIRST_CAMPAIGN_GUIDE_ID,
  title: "Your first ORC campaign",
  summary:
    "A walkthrough for campaign play, from an empty campaign to the end of session 1: the party, places and people, how to connect them, a rumour turned into an adventure with an encounter and a dungeon, and the session itself. Follow it in your own campaign; the example names are only there to show where things go.",
  mode: ["campaign"],
  chapters: [
    {
      id: "campaign",
      title: "Create the campaign",
      intro: "One campaign holds everything: the party, the places, the quests and every session.",
      steps: [
        step({
          id: "new-campaign",
          title: "Start a campaign",
          body: [
            "On the campaign list, click *New campaign*. Give it a name (the example is The Wardens of Mossford) and choose *Fantasy d20 Remaster (ORC)* as the *Game module*. The dialog shows the module's licence and notices.",
            "Under *Play mode*, *Campaign* is long-running play: characters gain levels over many sessions, with factions, quests and a world that moves between adventures; this guide follows it. *One-shot* is a single evening: quick characters from the builder, one adventure and a clear ending. Click *Create campaign*.",
          ],
          image: { key: "new-campaign", alt: "The New campaign dialog with the Fantasy d20 Remaster (ORC) module chosen and its ORC License line" },
        }),
        step({
          id: "home-checklist",
          title: "Meet the setup checklist",
          body: [
            "The campaign opens on *Home*, which leads with *Set up your campaign*: the player characters, the players and who plays whom, and the first session. Each step ticks itself when the campaign holds what it asks for, and its button goes straight to where it is done.",
            "You can do them in any order, or click *Hide this*; *Settings* can show the checklist again. This guide walks the same ground and more; *Guide* on Home, or *Step-by-step guide* on the checklist, brings you back to it.",
          ],
          image: { key: "home-checklist", alt: "Home with the Set up your campaign checklist, the Add the player characters step highlighted" },
          links: [{ label: "Open Home", page: "home" }],
        }),
      ],
    },
    {
      id: "party",
      title: "Make the party",
      intro: "A player character for each player, and who plays whom.",
      steps: [
        step({
          id: "build-character",
          title: "Build a character",
          body: [
            "Click *Open the PCs* in the checklist, then *Build a character*. The builder walks *Ancestry* (with a heritage and the ancestry's boosts), *Background*, *Class*, *Attribute boosts*, *Skills and languages*, *Starting level*, *Level by level* (each level's feats), *Equipment* and *Details*; the side summary shows the attribute modifiers, Hit Points, AC, Perception, saves and class DC that follow.",
            "Each step says what is still missing. *Review* lists every grant with where it came from, and what is left to do by hand (here for Ilsa Varrow, a human fighter); click *Create character* and her sheet opens. *Keep for later* leaves a half-built character on the PCs tab, to resume.",
          ],
          image: { key: "build-character", alt: "The character builder's review of Ilsa Varrow, a human fighter, with the side summary" },
          links: [
            { label: "Open the PCs", page: "atlas", params: { tab: "pcs" } },
            { label: "Ancestries", reference: { list: LIST.ancestries } },
            { label: "Backgrounds", reference: { list: LIST.backgrounds } },
            { label: "Classes", reference: { list: LIST.classes } },
          ],
          cite: cite("Player Core", "Ancestries"),
        }),
        step({
          id: "pc-by-hand",
          title: "Or make one by hand",
          body: [
            "On the PCs tab, click *+ New* (or *+ Player character* while the tab is empty). The type is *Player character*; type a *Name* (here Tamsin Reed), keep *Blank*, and click *Create player character*.",
            "Fill the sheet in yourself: attribute modifiers, proficiency ranks, Strikes, gear. Everything marked *computed* (check totals, AC, Hit Points, class DC, spell DC, Bulk) works itself out and is never typed in.",
          ],
          image: { key: "pc-by-hand", alt: "The New player character page with a blank character named Tamsin Reed" },
          links: [
            { label: "New player character", newEntity: { type: CHARACTER, pc: true } },
            { label: "Skills", reference: { list: LIST.skills } },
          ],
        }),
        step({
          id: "players",
          title: "Add the players and who plays whom",
          body: [
            "Click *Add players* in the checklist: it opens *Settings* at *Players*. Type each player's name and click *Add player*, then tick who plays which PC (*Alex plays Ilsa Varrow*).",
            "Players have no accounts in this version; knowing who plays whom lets you share a handout with one player and send each player a packet with their own sheet.",
          ],
          image: { key: "players", alt: "The Players card in Settings with Alex playing Ilsa Varrow and Sam playing Tamsin Reed" },
          links: [{ label: "Open Players", page: "settings", params: { section: "players" } }],
        }),
        step({
          id: "pc-sheet",
          title: "The character sheet",
          body: [
            "Open a PC from the Atlas's *PCs* tab. The sheet names who plays it (*Played by*); fold a section away by its title (here *Character*) to bring the next ones up: *Attribute modifiers*, then *Defense and health*, where AC and Hit Points are computed. *Level up* runs the builder again for the next level.",
            "Click *Roll* beside a skill for a check: the roll panel takes a DC, fortune or misfortune and the multiple attack penalty, and reads all four degrees of success.",
          ],
          image: { key: "pc-sheet", alt: "Ilsa Varrow's sheet, played by Alex: her attribute modifiers and her computed Armor Class and Hit Points" },
          links: [{ label: "Open the PCs", page: "atlas", params: { tab: "pcs" } }],
        }),
      ],
    },
    {
      id: "places",
      title: "Places",
      intro: "Locations nest: a settlement holds a tavern, a dungeon its rooms.",
      steps: [
        step({
          id: "settlement",
          title: "Add a settlement",
          body: [
            "On Home, click *+ Location*. Choose a *Subtype*: *Settlement* adds size, level, population and who is in charge to the sheet, and there are *Dungeon or lair*, *Room or area*, *Wilderness*, *Building* and *Plane* too.",
            "Name it (Mossford, the party's home town) and click *Create location*. On its page, write the one-line *Summary* under the name: what the place is, at a glance.",
          ],
          image: { key: "settlement", alt: "The New location page with the Settlement subtype and the name Mossford" },
          links: [{ label: "New location", newEntity: { type: LOCATION } }],
        }),
        step({
          id: "place-inside",
          title: "Put a place inside another",
          body: [
            "Make a second location, a *Building* called the Ferryman's Rest. On its page, open *Relationships*, click *+ Add relationship*, choose *within*, click *Choose…*, pick *Mossford* and click *Add*.",
            "The Atlas's *Locations* tab now shows the inn under the town. The settlement and dungeon generators nest their places the same way.",
          ],
          image: { key: "place-inside", alt: "The Link dialog: the Ferryman's Rest within Mossford" },
          links: [{ label: "Open Locations", page: "atlas", params: { tab: "locations" } }],
        }),
        step({
          id: "settlement-generator",
          title: "Or roll a settlement and its tavern",
          body: [
            "On *Generate*, open *Settlement and tavern*. Each step shows its roll: a name, a size and level, a notable feature, a local trouble, the tavern and its innkeeper. *Re-roll* or *Pin* any step; a *Seed* gives the same result every time.",
            "The *Preview* lists what will join the campaign; rename anything there (here the village of Ivyford, the Merry Crow and its keeper Bram Oakhollow; the rumour and the tavern's text follow the new names) and click *Accept into campaign*. The tavern sits within the village, and the local trouble lands on Home's *Quest board* as a rumour.",
          ],
          image: { key: "settlement-generator", alt: "The Settlement and tavern generator: its seed and first rolls beside the preview of Ivyford, its trouble, and the Merry Crow within it" },
          links: [
            { label: "Roll a settlement", procedure: SETTLEMENT },
            { label: "Settlement size", reference: { table: id("settlement.size") } },
          ],
        }),
      ],
    },
    {
      id: "people",
      title: "People",
      intro: "NPCs from Monster Core's stat blocks, from the NPC generator, or by hand.",
      steps: [
        step({
          id: "npc-preset",
          title: "An NPC from a stat block",
          body: [
            "On Home, click *+ NPC from preset*: it opens a new *Creature* with Monster Core's stat blocks to start from, people as well as monsters. *Search presets* (here “street watcher”), pick one (*Halfling Street Watcher*), name them (Corin Dale, Mossford's watch sergeant) and click *Create creature*.",
            "The level, AC, Hit Points, saves, skills and Strikes come with the stat block, ready for the combat panel. Use one for anyone who may end up in a fight.",
          ],
          image: { key: "npc-preset", alt: "The New creature page with the Halfling Street Watcher stat block chosen and named Corin Dale" },
          links: [
            { label: "New creature", newEntity: { type: CREATURE } },
            { label: "Halfling Street Watcher", reference: { preset: preset("halfling-street-watcher") } },
          ],
        }),
        step({
          id: "npc-generator",
          title: "Roll an NPC",
          body: [
            "On *Generate*, open *NPC*: a name, an ancestry, an occupation with a Monster Core stat block to use if it comes to a fight, a quirk, a voice, what they want and what they hide. Rename them in the *Preview* (here Hesper Quill, an elf alchemist's assistant who knows a hidden way in) and click *Accept into campaign*.",
            "*Another NPC* rolls the next one: keep a few ready, so the people the party meets by chance do not all sound alike.",
          ],
          image: { key: "npc-generator", alt: "The NPC generator: its seed and first rolls beside the preview of Hesper Quill with her occupation, quirk, voice, want and secret" },
          links: [{ label: "Roll an NPC", procedure: NPC_GENERATOR }],
        }),
        step({
          id: "npcs",
          title: "An NPC by hand, and the NPCs tab",
          body: [
            "On the Atlas, click *+ New*, choose *NPC* as the *Type*, name them (Odalys Brand, the reeve of Mossford) and click *Create NPC*. Write the *Summary*: one line on who they are. The sheet has room for their attitude toward the party, how to play them and a stat block to use.",
            "The Atlas's *NPCs* tab lists everyone with an NPC sheet; creatures such as Corin Dale are on the *Creatures* tab.",
          ],
          image: { key: "npcs", alt: "The Atlas's NPCs tab listing Bram Oakhollow, Hesper Quill and Odalys Brand" },
          links: [
            { label: "New NPC", newEntity: { type: NPC } },
            { label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } },
          ],
        }),
      ],
    },
    {
      id: "connections",
      title: "Connect them",
      intro: "Relationships, links in notes, and who gets to see what.",
      steps: [
        step({
          id: "relationship",
          title: "Add a relationship",
          body: [
            "Open an NPC (Odalys Brand), go to *Relationships* and click *+ Add relationship*. Choose how they relate (*knows*, *member of*, *owns*, *wants*, *within* and more, and this module's own *rival of* and *serves*; a creature's page also offers *lairs in* and *guards*), *Choose…* who, add a *Note* if it helps (“Pays her to watch the ferry road”) and click *Add*.",
            "A relationship shows on both pages: Ilsa Varrow's *Relationships* tab lists Odalys Brand too.",
          ],
          image: { key: "relationship", alt: "The Link dialog: Odalys Brand knows Ilsa Varrow, with a note" },
          links: [{ label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } }],
        }),
        step({
          id: "mention",
          title: "Link people and places in a note",
          body: [
            "On the same page, open *Notes* and click *+ Add note*. Type *@* and a few letters of a name: pick the entity from the list to link it, or make a new one on the spot with *Create “…” as…*. Scene notes, read-aloud text and the notes on Home's *+ Note* link the same way.",
          ],
          image: { key: "mention", alt: "A note on Odalys Brand with the @ list offering the Ferryman's Rest" },
          links: [{ label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } }],
        }),
        step({
          id: "backlinks",
          title: "See what links here",
          body: [
            "Open the place you linked (the Ferryman's Rest) and its *Backlinks* tab: every note, scene, session and handout that mentions it, with how. Click one to open it.",
          ],
          image: { key: "backlinks", alt: "The Ferryman's Rest's Backlinks tab listing the note on Odalys Brand, via mention" },
          links: [{ label: "Open Locations", page: "atlas", params: { tab: "locations" } }],
        }),
        step({
          id: "graph",
          title: "The graph",
          body: [
            "The Atlas's *Graph* tab draws every relationship at once, places beside people; the filters above it narrow it to a type or a tag.",
          ],
          image: { key: "graph", alt: "The Atlas graph with the places, the party and the NPCs and their links" },
          links: [{ label: "Open the graph", page: "atlas", params: { tab: "graph" } }],
        }),
        step({
          id: "player-view",
          title: "GM only, or for the players",
          body: [
            "Everything starts *GM only*. The select beside the type on each page sets who may see it: *Players*, *Revealed* once it has come up in play, or *Some players*; *Field visibility…* hides single fields, such as an NPC's secret.",
            "Tick *Preview as player* on the Atlas to check: here only Mossford, set to *Players*, is left. Sharing with players and table mode's player screen follow the same rules.",
          ],
          image: { key: "player-view", alt: "The Atlas previewed as a player, showing only Mossford" },
          links: [{ label: "Open the Atlas", page: "atlas", params: { tab: "locations" } }],
        }),
      ],
    },
    {
      id: "adventure",
      title: "An adventure",
      intro: "A rumour on the quest board, an adventure from a template, an encounter and a dungeon for it.",
      steps: [
        step({
          id: "quest",
          title: "A quest from the quest board",
          body: [
            "Home's *Quest board* groups the campaign's quests by status, from *Rumour* to *Completed* and *Failed*. Ivyford's local trouble is there already (“Livestock vanish at night”); *+ Quest* adds one by hand.",
            "Open it and fill in what the party needs: the *Hook*, the *Patron* (Odalys Brand), the *Objective* and the *Reward*. Set its *Status* to *Offered* when the party hears of it and *Active* once they take it on.",
          ],
          image: { key: "quest", alt: "The quest Livestock vanish at night, offered, with its hook, patron, objective and reward" },
          links: [
            { label: "Open the quest", entity: aQuest },
            { label: "Open Home", page: "home" },
          ],
        }),
        step({
          id: "new-adventure",
          title: "Start an adventure from a template",
          body: [
            "Open *Adventures* and click *New adventure*. *A short delve* gives three acts (*Rumours*, *The lair*, *Aftermath*) with their scenes; *Blank* starts empty, and *Show templates for other play modes* adds the one-shot in three acts. Give it a *Title* (here The Crowfoot Warren) and click *Create adventure*.",
            "Write the *Player introduction* the players hear and *The situation (GM only)*: what is really going on.",
          ],
          image: { key: "new-adventure", alt: "The adventure made from A short delve, with its three acts and their scenes in the outline" },
          links: [{ label: "Open Adventures", page: "adventures" }],
        }),
        step({
          id: "scene",
          title: "Put places and people in a scene",
          body: [
            "Click a scene in the outline (Act 1's first). *Location* *Pick* sets where it happens (here the Merry Crow); *Participants* *+ Add* puts NPCs, PCs and creatures in it (Bram Oakhollow and Hesper Quill). *Clues* and *Encounter* are picked the same way; *Map* is a select of the campaign's maps, with *Create map* beside it.",
            "Below, *Events* lists what must or may happen, *Read-aloud text* is the boxed text for the players, and *Scene notes* take *@* links. Table mode shows all of it for the scene you are in.",
          ],
          image: { key: "scene", alt: "The first scene with the Merry Crow as its location and Bram Oakhollow and Hesper Quill as participants" },
          links: [{ label: "Open Adventures", page: "adventures" }],
        }),
        step({
          id: "encounter",
          title: "Build an encounter",
          body: [
            "On *Generate*, open *Encounter builder*. Set the *Party level*, *Party size* and *Threat*: it spends the XP budget for them on Monster Core creatures, then rolls what they are doing and a twist. Here two kobold warriors rest by the road, one lookout half awake. Click *Accept into campaign*: the encounter and each creature, with its stat block, join the campaign.",
            "Back in the adventure, open the scene for it (*The road there*) and *Pick* it as the *Encounter*. Picking it does not bring its creatures along: *+ Add* them as *Participants* too, since at the table the combat panel fights whoever is in the scene.",
          ],
          image: { key: "encounter", alt: "The encounter builder for a party of two at level 1, moderate threat: its XP budget and rolls beside the preview of two kobold warriors resting with a lookout" },
          links: [
            { label: "Build an encounter", procedure: ENCOUNTER_BUILDER },
            { label: "Open Adventures", page: "adventures" },
            { label: "Kobold Warrior", reference: { preset: preset("kobold-warrior") } },
          ],
          cite: BUILDING_ENCOUNTERS,
        }),
        step({
          id: "dungeon",
          title: "Generate the dungeon",
          body: [
            "On *Generate*, under *Site maps*, open *Dungeon*. Fill the brief (a *Cave or cavern*, *Small*, the party's level and size, the *Threat* and a *Theme* such as *Kobolds*), keep or type a *Seed* and click *Generate*: a map on a 5-foot grid with doors and secrets, room purposes, encounters, traps and treasure.",
            "Name it (the Crowfoot Warren) and click *Save to campaign*: its rooms, encounters, creatures and hazards join the campaign, and the map's page has a *Player map* tab without the GM's marks. Pick it as the *Map* of the lair's scenes (here *Entrance*); at the table, the player screen shows only the rooms the party has found.",
          ],
          image: { key: "dungeon", alt: "The Crowfoot Warren, a generated kobold cave saved to the campaign: the GM's map with its numbered rooms" },
          links: [{ label: "Open Generate", page: "generate" }],
          cite: BUILDING_ENCOUNTERS,
        }),
        step({
          id: "handout",
          title: "Add a handout",
          body: [
            "Click an act in the outline (Act 1) and, under *Handouts*, *+ Handout*. Title it (here “A letter from the reeve”), open it to write the text or add an image, and leave it *GM only*: you reveal it at the table. *+ Personal handout* adds a handout for one character, which goes to that player alone.",
          ],
          image: { key: "handout", alt: "Act 1's Handouts card with A letter from the reeve" },
          links: [{ label: "Open Adventures", page: "adventures" }],
        }),
      ],
    },
    {
      id: "session",
      title: "A session",
      intro: "Plan it, run it at the table, wrap it up; the next one is planned for you.",
      steps: [
        step({
          id: "session-plan",
          title: "Plan the session",
          body: [
            "Click *Plan a session* in the checklist: it opens *Sessions*, where *Plan next session* makes session 1. *Scenes planned* is what table mode steps through, in order: open *Add scenes* and click *+ Plan* beside each scene (or *Add all* for an act); reorder or remove them. Under *Plan*, add what to remember (“Hesper knows a hidden way into the warren”).",
            "The *Session checklist* adds this module's own reminders: levels and spell slots, tonight's encounter budgets, three names ready.",
          ],
          image: { key: "session-plan", alt: "Session 1's Scenes planned: the witnesses, the road and the entrance" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "table",
          title: "Start it: table mode and combat",
          body: [
            "Click *Start this session* on Home. Table mode shows the scene you are in with its read-aloud text, events and participants; *Mark run* or *Skip* it and *Next →* moves on. The clock's *+ Round*, *+ Minute* and *+ Hour* keep time, and the tabs hold the trackers (dying, wounded, doomed, Hero Points, conditions), dice, hints, the checklist and the log.",
            "In a scene with creatures, the *Combat* panel's *Roll initiative for everyone* sorts the order; each card takes *Damage*, *Heal* and *+ Condition*, *Attack* rolls a Strike against AC with all four degrees (a PC's Strikes work out their attack and damage from the sheet), and *Next turn* moves on.",
          ],
          image: { key: "table", alt: "Table mode on the road scene: the combat panel with the kobolds and the party in initiative order" },
          links: [
            { label: "Open Sessions", page: "sessions" },
            { label: "Conditions", reference: { list: LIST.conditions } },
            { label: "Actions", reference: { list: LIST.actions } },
          ],
          cite: cite("Player Core", "Encounter Mode", "Initiative"),
        }),
        step({
          id: "reveal",
          title: "Reveal a handout",
          body: [
            "In the *Reveal* panel, click *Reveal* beside a handout of the scene, act or adventure: it goes on the *Player screen* (a second window for the players) and counts as revealed from now on. *Pin* keeps it there, *Clear the screen* takes everything down.",
          ],
          image: { key: "reveal", alt: "The Reveal panel with A letter from the reeve on the player screen" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "wrap-up",
          title: "Wrap up",
          body: [
            "Click *End session*. The wrap-up walks *Summary* (a draft from what the session logged, to edit into your words; *Draft again from the log* starts over), *Rewards*, *Timeline* and *Loose ends*, beside the *After the session* checklist with this module's reminders: clear conditions, award experience points, record treasure. Everything you type is kept as you go. Click *Finish session*.",
          ],
          image: { key: "wrap-up", alt: "The session wrap-up on its Summary step" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "next-session",
          title: "The next session",
          body: [
            "Finishing plans the next session and carries the loose ends into its *Plan*; it opens on that session's page, ready for its *Scenes planned*. Before you start it, *Build the recap* writes a \"Previously on…\" from what the campaign recorded.",
            "Between sessions, the *Campaign primer* on Home is the players' introduction to the campaign, and *GM screen* is the module's quick reference, on screen or printed.",
          ],
          image: { key: "next-session", alt: "Session 2's Scenes planned, still empty, and its Plan with the loose end carried over" },
          links: [
            { label: "Open Sessions", page: "sessions" },
            { label: "Open the primer", page: "primer" },
          ],
        }),
      ],
    },
  ],
};
