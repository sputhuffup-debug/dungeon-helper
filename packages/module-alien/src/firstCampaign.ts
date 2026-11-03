/**
 * "Your first Alien campaign": the module's guide (`GameModule.guide`), a
 * walkthrough from a new campaign in campaign play to the end of session 1.
 * It makes the crew, their ship, a home port with a place inside it, two
 * NPCs, connects them (relationships, @ links and backlinks, the graph, who
 * sees what), takes a job from the job board and runs it as an adventure,
 * then plans, plays and wraps up the session.
 *
 * The app shows it on the Guide page; `pnpm guides` writes the same text to
 * docs/guides/alien-first-campaign.md. Every step's image is taken by the
 * screenshot script (apps/web/screenshots/readme.spec.ts, "guide-alien"),
 * which performs these steps in the app with the names used here.
 *
 * Module-original wording; the example campaign (Breakwater Freight, Juno
 * Okafor, Tobias Reyne, the Marigold Dawn, Halvorsen Relay, the Lantern Bar,
 * Oskar Brandt, Wen Halloran, the Brannock Deep run) is invented for it.
 * `*Label*` marks a button or label exactly as the app shows it.
 */
import type { GuideDef, GuideStepDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "./modes";
import { CAMPAIGN_AGENDAS_ID } from "./procedures/campaign-agendas";
import { CAMPAIGN_THREAD_ID } from "./procedures/campaign-thread";
import { JOB_BOARD_ID } from "./procedures/job-board";

export const FIRST_CAMPAIGN_GUIDE_ID = "alien.first-campaign";

const CHARACTER = "alien.character";
const LOCATION = "alien.location";
const JOB = "alien.job";
const LIFEPATH = "alien.lifepath";

/** The accepted job the guide takes, for the "Open the job" links (hidden until there is one). */
const takenJob = { and: [{ "==": [{ var: "type" }, JOB] }, { in: [{ var: "fields.status" }, ["accepted", "done"]] }] };

const step = (s: GuideStepDef): GuideStepDef => s;

export const firstCampaignGuide: GuideDef = {
  id: FIRST_CAMPAIGN_GUIDE_ID,
  title: "Your first Alien campaign",
  summary:
    "A walkthrough for campaign play, from an empty campaign to the end of session 1: the crew and their ship, places and people, how to connect them, a job run as an adventure, and the session itself. Follow it in your own campaign; the example names are only there to show where things go.",
  mode: [CAMPAIGN],
  chapters: [
    {
      id: "campaign",
      title: "Create the campaign",
      intro: "One campaign holds everything: the crew, the places, the jobs and every session.",
      steps: [
        step({
          id: "new-campaign",
          title: "Start a campaign",
          body: [
            "On the campaign list, click *New campaign*. Give it a name (the example is Breakwater Freight), keep *Alien RPG (Evolved Edition)* as the *Game module* and choose the *Play mode*.",
            "*Campaign* is long-running play with player-made characters, jobs and a home base; this guide follows it. *Cinematic* is a one-shot in three acts with pregenerated characters, built with the guided adventure builder instead.",
            "Campaign play asks the *Campaign frame* once: *Space Truckers*, *Colonial Marines* or *Frontier Colonists*. Job boards and between jobs start from it, and Settings can change it later. Click *Create campaign*.",
          ],
          image: { key: "new-campaign", alt: "The New campaign dialog with the Alien module, campaign play and the Space Truckers frame chosen" },
          page: [234, 235],
        }),
        step({
          id: "home-checklist",
          title: "Meet the setup checklist",
          body: [
            "The campaign opens on *Home*, which leads with *Set up your campaign*: eight steps from the crew to session 1. Each one ticks itself when the campaign holds what it asks for, and its buttons go straight to where it is done. The highlighted step is the next one.",
            "You can do the steps in any order, or click *Hide this*; *Settings* can show the checklist again. This guide walks the same ground with a bit more about each page; *Guide* on Home, or *Step-by-step guide* on the checklist, brings you back to it.",
          ],
          image: { key: "home-checklist", alt: "Home with the Set up your campaign checklist, the Make the crew step highlighted" },
          links: [{ label: "Open Home", page: "home" }],
        }),
      ],
    },
    {
      id: "crew",
      title: "Make the crew",
      intro: "A player character for each player, and who plays whom.",
      steps: [
        step({
          id: "life-path",
          title: "Roll a character with the Life Path",
          body: [
            "Click *Roll a Life Path* in the checklist (it is also beside *+ New* on the Atlas's *PCs* tab). Every roll of the appendix's life path is laid out with its page; pick a *Career* or let the dice decide, and *Re-roll* or *Pin* any step you want changed or kept.",
            "The preview reads like the finished sheet: career, talents, gear and the summary line. Type the character's name in it (here Juno Okafor, a pilot) and click *Accept into campaign*: the new PC opens, with every roll kept as provenance.",
          ],
          image: { key: "life-path", alt: "The Life Path generator with a pilot rolled and named Juno Okafor in the preview" },
          links: [{ label: "Roll a Life Path", procedure: LIFEPATH }],
          page: [282, 289],
        }),
        step({
          id: "pc-by-hand",
          title: "Or make one by hand",
          body: [
            "Click *+ Character* in the checklist. *Player character* is already ticked under *Starting details*; type a *Name* (here Tobias Reyne), start from *Blank* or one of the typical NPCs as a base, add starting weapons if you like, and click *Create character*.",
            "Fill in the rest on the sheet: attributes, skills, talents, gear. Health and Resolve work themselves out from the attributes.",
          ],
          image: { key: "pc-by-hand", alt: "The New character page with a blank player character named Tobias Reyne" },
          links: [{ label: "New player character", newEntity: { type: CHARACTER, pc: true } }],
        }),
        step({
          id: "players",
          title: "Add the players and who plays whom",
          body: [
            "Click *Add players* in the checklist: it opens *Settings* at *Players*. Type each player's name and click *Add player*, then tick who plays which PC (*Alex plays Juno Okafor*).",
            "Players have no accounts in this version; knowing who plays whom lets you share a handout with one player and send each player a packet with their own sheet.",
          ],
          image: { key: "players", alt: "The Players card in Settings with Alex playing Juno Okafor and Sam playing Tobias Reyne" },
          links: [{ label: "Open Players", page: "settings", params: { section: "players" } }],
        }),
        step({
          id: "buddy-rival",
          title: "Buddy and rival",
          body: [
            "Open a PC from the Atlas's *PCs* tab. Its sheet shows who plays it (*Played by*), and the *Identity* section's *Buddy* and *Rival* pick from the other PCs: the first connections in the campaign.",
            "The session wrap-up's XP questions and the campaign agendas read them, so pick them now if your players have.",
          ],
          image: { key: "buddy-rival", alt: "Tobias Reyne's sheet, played by Sam, with Juno Okafor as his buddy" },
          links: [{ label: "Open the PCs", page: "atlas", params: { tab: "pcs" } }],
          page: 27,
        }),
      ],
    },
    {
      id: "ship",
      title: "The crew's ship",
      steps: [
        step({
          id: "ship",
          title: "Choose the crew's ship",
          body: [
            "Open *Ship* in the sidebar. Under *Crew's ship*, choose *+ New spaceship…*, start from a ship preset (the example uses the *Model CM-88G Bison*), name it (Marigold Dawn) and click *Create and choose*.",
            "The page then shows the ship's hull, parts and provisions, the ledger of crew funds and each PC's cash, the travel planner and *Run between jobs*. Table mode shows the ship too.",
          ],
          image: { key: "ship", alt: "The Ship page with the Marigold Dawn chosen as the crew's ship" },
          links: [{ label: "Open the Ship page", page: "ship" }],
          page: 158,
        }),
      ],
    },
    {
      id: "places",
      title: "Places",
      intro: "Locations nest: a system holds a planet, a planet a colony, a station a bar.",
      steps: [
        step({
          id: "location",
          title: "Add a station",
          body: [
            "On Home, click *+ Location*. Choose a *Subtype*: a *Colony* suits a station or settlement, a *Site* a single place such as a bar, a mine or a derelict, and there are *Star system* and *Planet* sheets too. Start from *Blank*, or from one of the book's places in the preset list.",
            "Name it (Halvorsen Relay) and click *Create location*. On its page, write the one-line *Summary* under the name: what the place is, at a glance.",
          ],
          image: { key: "location", alt: "The New location page with the Colony subtype and a blank start" },
          links: [{ label: "New location", newEntity: { type: LOCATION } }],
        }),
        step({
          id: "place-inside",
          title: "Put a place inside another",
          body: [
            "Make a second location, a *Site* called The Lantern Bar. On its page, open *Relationships*, click *+ Add relationship*, choose *within*, click *Choose…*, pick *Halvorsen Relay* and click *Add*.",
            "The Atlas's *Locations* tab now shows the bar under the station. The same *within* link nests planets in systems and colonies on planets; the star system and world generators do it for you.",
          ],
          image: { key: "place-inside", alt: "The Link dialog: The Lantern Bar within Halvorsen Relay" },
          links: [{ label: "Open Locations", page: "atlas", params: { tab: "locations" } }],
        }),
        step({
          id: "home-base",
          title: "Make it the crew's home base",
          body: [
            "Click *Choose it* on the checklist's *Pick a home base* step: it opens *Settings* at *Campaign*. Pick *Halvorsen Relay* as the *Home base* (or *+ New location…* to make one there).",
            "Job boards post their jobs at the home base, and between jobs the crew comes back to it.",
          ],
          image: { key: "home-base", alt: "The Campaign card in Settings with Halvorsen Relay as the home base" },
          links: [{ label: "Open Campaign settings", page: "settings", params: { section: "campaign" } }],
          page: 159,
        }),
      ],
    },
    {
      id: "people",
      title: "People",
      intro: "NPCs from the book's typical NPCs, by hand, or from a generator.",
      steps: [
        step({
          id: "npc-preset",
          title: "An NPC from a preset",
          body: [
            "On Home, click *+ NPC from preset*. *Search presets* for the kind of person you need, pick one of the book's 25 typical NPCs (here *Ship’s engineer*), give them a name (Oskar Brandt) and click *Create character*. The stat line, skills and weapons come with the preset.",
          ],
          image: { key: "npc-preset", alt: "The New character page with the Ship's engineer preset chosen and named Oskar Brandt" },
          links: [{ label: "New NPC", newEntity: { type: CHARACTER } }],
          page: [258, 259],
        }),
        step({
          id: "npcs",
          title: "An NPC by hand, and the NPCs tab",
          body: [
            "On the Atlas's *NPCs* tab, click *+ New*, start from *Blank*, name them (Wen Halloran, the station's harbourmaster) and write the *Summary*: one line on who they are. Add stats only if they will ever roll.",
            "The job board makes NPCs too: every job it deals comes with its contact and the other people in it, each with a want, a secret and an agenda (see *Take the job* below).",
          ],
          image: { key: "npcs", alt: "The Atlas's NPCs tab listing Oskar Brandt and Wen Halloran" },
          links: [{ label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } }],
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
            "Open an NPC (Oskar Brandt), go to *Relationships* and click *+ Add relationship*. Choose how they relate (*knows*, *member of*, *owns*, *wants*, *buddy of*, *rival of*, *crew of*, *within* and more), *Choose…* who, add a *Note* if it helps (“Owes him a favour from the Pell run”) and click *Add*.",
            "A relationship shows on both pages: Tobias Reyne's *Relationships* tab lists Oskar Brandt too.",
          ],
          image: { key: "relationship", alt: "The Link dialog: Oskar Brandt knows Tobias Reyne, with a note" },
          links: [{ label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } }],
        }),
        step({
          id: "mention",
          title: "Link people and places in a note",
          body: [
            "On the same page, open *Notes* and click *+ Add note*. Type *@* and a few letters of a name: pick the entity from the list to link it, or make a new one on the spot with *Create “…” as…*. Scene notes, read-aloud text and the notes on Home's *+ Note* link the same way.",
          ],
          image: { key: "mention", alt: "A note on Oskar Brandt with the @ list offering The Lantern Bar" },
          links: [{ label: "Open the NPCs", page: "atlas", params: { tab: "npcs" } }],
        }),
        step({
          id: "backlinks",
          title: "See what links here",
          body: [
            "Open the place you linked (The Lantern Bar) and its *Backlinks* tab: every note, scene, session and handout that mentions it, with how. Click one to open it.",
          ],
          image: { key: "backlinks", alt: "The Lantern Bar's Backlinks tab listing the note on Oskar Brandt, via mention" },
          links: [{ label: "Open Locations", page: "atlas", params: { tab: "locations" } }],
        }),
        step({
          id: "graph",
          title: "The graph",
          body: [
            "The Atlas's *Graph* tab draws every relationship at once, places beside people; the filters above it narrow it to a type or a tag.",
          ],
          image: { key: "graph", alt: "The Atlas graph with the locations and characters and their links" },
          links: [{ label: "Open the graph", page: "atlas", params: { tab: "graph" } }],
        }),
        step({
          id: "player-view",
          title: "GM only, or for the players",
          body: [
            "Everything starts *GM only*. The select beside the type on each page sets who may see it: *Players*, *Revealed* once it has come up in play, or *Some players*; *Field visibility…* hides single fields, such as a secret.",
            "Tick *Preview as player* on the Atlas to check: here only Halvorsen Relay, set to *Players*, is left. Sharing with players and table mode's player screen follow the same rules.",
          ],
          image: { key: "player-view", alt: "The Atlas previewed as a player, showing only Halvorsen Relay" },
          links: [{ label: "Open the Atlas", page: "atlas", params: { tab: "locations" } }],
        }),
      ],
    },
    {
      id: "adventure",
      title: "An adventure",
      intro: "In campaign play an adventure is usually a job: deal a job board, take a posting, run it.",
      steps: [
        step({
          id: "job-board",
          title: "Deal a job board",
          body: [
            "Click *Deal a job board* in the checklist, or *Job board* on *Generate*. It deals postings for the campaign frame, each as the players read it (pay, who posted it, requirements, a risk rating that may mislead) beside what only the GM knows (complications, the twist, the employer's real intent, and up to three NPCs with their agendas).",
            "Change *Postings*, *Employer bias* or *NPC treachery* and the board deals again; a *Seed* gives the same board every time. *Parts to re-roll or pin* re-rolls one part of a posting.",
          ],
          image: { key: "job-board", alt: "A job board posting: the players' side and the GM's side with the NPCs and the site brief" },
          links: [{ label: "Deal a job board", procedure: JOB_BOARD_ID }],
          page: [244, 252],
        }),
        step({
          id: "take-job",
          title: "Take the job",
          body: [
            "Click *Take the job* on the posting the crew goes for. The job, its employer, its NPCs (the contact visible to the players, the others GM-only until met) and a players' posting handout join the campaign, and Home's *Job board* lists the job under *Accepted*.",
            "The other postings stay on the board as dealt: *Keep as lead* keeps one for later, *Discard* drops it.",
          ],
          image: { key: "take-job", alt: "Home's Job board with the taken job under Accepted" },
          links: [{ label: "Open the job board", procedure: JOB_BOARD_ID }],
        }),
        step({
          id: "job-people",
          title: "The job's people",
          body: [
            "Open the job (rename it if you like: here The Brannock Deep run). *People in this job* lists its NPCs with what they want, their secret, their agenda and whether they turn on the crew. They are ordinary NPCs: link them, note them and put them in scenes like anyone else.",
          ],
          image: { key: "job-people", alt: "The job page's People in this job: the contact and two more NPCs with wants, secrets and agendas" },
          links: [{ label: "Open the job", entity: takenJob }],
        }),
        step({
          id: "site-map",
          title: "Generate the site map",
          body: [
            "On the job page, click *Generate site map*. The generator reads the job's site brief (site type, size, decks, threats, key rooms, the job's NPCs); type a *Seed* or keep the one offered, click *Generate*, look the map over and click *Save to campaign*. It is saved with the job's site, and the arrival scene will use it.",
          ],
          image: { key: "site-map", alt: "A generated GM deck plan for the job's site" },
          links: [{ label: "Open the job", entity: takenJob }],
          page: [54, 56],
        }),
        step({
          id: "run-job",
          title: "Run this job",
          body: [
            "Click *Run this job* on the job page. It becomes an adventure in four acts (briefing and departure, travel, destination, payout) with its scenes: the posting is the players' introduction, the complications, twist and NPC secrets are the GM's situation, and the arrival is set at the job's site on its site map.",
            "The briefing, transit, arrival and first complication are planned into the next session, so session 1 now exists.",
          ],
          image: { key: "run-job", alt: "The adventure made from the job, with its acts and scenes in the outline" },
          links: [{ label: "Open the job", entity: takenJob }, { label: "Open Adventures", page: "adventures" }],
        }),
        step({
          id: "scene",
          title: "Put places and people in a scene",
          body: [
            "Click a scene in the outline. *Location* *Pick* sets where it happens (here the briefing moves to Halvorsen Relay); *Participants* *+ Add* puts NPCs, PCs, creatures and vehicles in it (Oskar Brandt joins the contact). *Clues*, *Encounter* and *Map* (an existing map, or *Create map* from an image) work the same way.",
            "Below, *Events* lists what must or may happen, *Read-aloud text* is the boxed text for the players, and *Scene notes* take *@* links. Table mode shows all of it for the scene you are in.",
          ],
          image: { key: "scene", alt: "The briefing scene with Halvorsen Relay as its location and the contact and Oskar Brandt as participants" },
          links: [{ label: "Open Adventures", page: "adventures" }],
        }),
        step({
          id: "handout",
          title: "Add a handout",
          body: [
            "Click an act in the outline (Act 1) and, under *Handouts*, *+ Handout*. Title it (here “Berth pass, Halvorsen Relay”), open it to write the text or add an image, and leave it *GM only*: you reveal it at the table. *+ Agenda* adds a character's agenda card, which goes to that player alone.",
          ],
          image: { key: "handout", alt: "Act 1's Handouts card with the Berth pass handout" },
          links: [{ label: "Open Adventures", page: "adventures" }],
        }),
        step({
          id: "new-adventure",
          title: "Or start an adventure from a template",
          body: [
            "*Adventures* → *New adventure* starts one without a job board: the *Job card* (choose a job under *Fill it from a job*, the same as *Run this job*), the module's other templates, or *Blank*. *Show templates for other play modes* lists the cinematic ones too.",
          ],
          image: { key: "new-adventure", alt: "The New adventure dialog with its templates" },
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
            "Open *Sessions* and the planned *Session 1* (or click *Plan next session*). *Scenes planned* is what table mode steps through, in order: reorder them, remove one, or *Add scenes* from any adventure. Under *Plan*, add what to remember (“Oskar wants his favour back”); the *Session checklist* is there if you want it.",
          ],
          image: { key: "session-plan", alt: "Session 1's Scenes planned: the briefing, transit, arrival and first complication" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "table",
          title: "Start it: table mode",
          body: [
            "Click *Start this session* on Home (or *Start* on Sessions). Table mode shows the scene you are in with its location, read-aloud text, events and participants; *Mark run* or *Skip* it and *Next →* moves on. The clock's *+ Round*, *+ Stretch* and *+ Shift* keep time, and the tabs hold the trackers, dice, hints, the checklist and the log.",
            "*Player screen* opens a second window for the players to look at.",
          ],
          image: { key: "table", alt: "Table mode on the briefing scene, with the clock and the crew's stress trackers" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "reveal",
          title: "Reveal a handout",
          body: [
            "In the *Reveal* panel, click *Reveal* beside a handout of the scene, act or adventure: it goes on the player screen and counts as revealed from now on. *Pin* keeps it there, *Clear the screen* takes everything down.",
          ],
          image: { key: "reveal", alt: "The Reveal panel with the Berth pass on the player screen" },
          links: [{ label: "Open Sessions", page: "sessions" }],
        }),
        step({
          id: "wrap-up",
          title: "Wrap up",
          body: [
            "Click *End session*. The wrap-up walks *Summary*, *End-of-session questions* (the XP questions and the award checklist), *Rewards*, *Timeline*, *Loose ends* and *Close the job* (done, failed or carried over, with *Collect payment*); everything you type is kept as you go. Click *Finish session*.",
          ],
          image: { key: "wrap-up", alt: "The session wrap-up on its Summary step" },
          links: [{ label: "Open Sessions", page: "sessions" }],
          page: 30,
        }),
        step({
          id: "next-session",
          title: "The next session",
          body: [
            "Finishing plans the next session and carries the loose ends into its *Plan*; it opens on that session's page, ready for its *Scenes planned*. When the job is closed, finishing lands on *Between jobs* instead: pay, upkeep and shore leave, then *Deal the next job board*, and the loop starts again.",
            "Before you start it, *Build the recap* writes a \"Previously on…\" from what the campaign recorded. The checklist's two remaining steps, campaign agendas and campaign threads, can come in at any point.",
          ],
          image: { key: "next-session", alt: "Session 2's Scenes planned, still empty, and its Plan with the loose end carried over" },
          links: [
            { label: "Open Sessions", page: "sessions" },
            { label: "Deal campaign agendas", procedure: CAMPAIGN_AGENDAS_ID },
            { label: "Deal threads", procedure: CAMPAIGN_THREAD_ID },
          ],
        }),
      ],
    },
  ],
};
