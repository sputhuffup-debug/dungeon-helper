import type { RuleCard } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { F, TR, card } from "./card";

const M = { mode: [CINEMATIC] };

/** Cinematic play (p. 27, 157-158). */
export const cinematicPlayRules: RuleCard[] = [
  card("adventure-structure", "Structure of a cinematic adventure", "A cinematic adventure has a read-aloud player introduction (What's the story, Mother?), the GM's view of the real situation, the PCs and NPCs with stats and an agenda per act for each PC, mapped key locations, three acts of events, and an epilogue.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.pregenerated-characters", "alien.rule.cinematic-agendas"] },
  }),
  card("three-acts", "Acts and events", "The three acts are the Setup, the Tilt and the Showdown. Each act offers a number of events: a few may be mandatory, but most should be optional and stand-alone, used or not depending on what the PCs do, and some target all PCs while others target one.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.act-setup", "alien.rule.act-tilt", "alien.rule.act-showdown", "alien.rule.adventure-structure"] },
  }),
  card("act-setup", "Act I: the Setup", "The PCs and NPCs are introduced and the conflicts are established. Start easy and add complications slowly, building dread before anything is shown.", [152, 157], {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.stages-of-fear"] },
  }),
  card("act-tilt", "Act II: the Tilt", "Something unexpected happens that raises the stakes and the danger, and secrets come out. Agendas for the first two acts should avoid open confrontation between PCs.", [157, 158], {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.cinematic-agendas"] },
  }),
  card("act-showdown", "Act III: the Showdown", "The story reaches its climax, resolved by what the PCs do; this is the recommended act for any PvP. An epilogue follows: a sign-off message from a surviving PC, read aloud or adapted to what happened.", [157, 158], {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.calling-pvp"], trackers: [TR.countdown] },
  }),
  card("pregenerated-characters", "Pregenerated characters", "Cinematic adventures include ready-made PCs, written like roles in a script so that their backgrounds and agendas fit the plot. Players decide who plays whom, rolling dice if they cannot agree.", [24, 157], {
    ...M,
    tags: ["cinematic", "character"],
    links: { rules: ["alien.rule.play-modes", "alien.rule.adventure-structure"] },
  }),
  card("cinematic-agendas", "Agendas, secrets and handouts", "At the start of each act the GM hands each PC a hidden agenda; players keep it secret and off the character sheet. Avoid private messages with players, as they slow play and draw suspicion; some groups prefer open agendas, keeping player and PC knowledge apart.", [27, 158], {
    ...M,
    tags: ["cinematic", "character"],
    links: { fields: [F.agendas, F.storyPoints], rules: ["alien.rule.story-point-award", "alien.rule.agendas"] },
  }),
  card("story-point-award", "Earning and keeping Story Points", "At the end of each act, a player whose PC advanced their agenda despite risk or sacrifice gets one Story Point, announced without explanation so the agenda stays hidden. One leftover Story Point may carry over to the group's next adventure, even with a new PC.", 158, {
    ...M,
    tags: ["cinematic", "dice"],
    links: { fields: [F.storyPoints], rules: ["alien.rule.story-points"], trackers: [TR.storyPoints] },
  }),
  card("calling-pvp", "Calling PvP", "When a PC's conflict with the group passes the point of no return, the GM calls PvP and the scene is played to its end. A surviving traitor becomes an NPC under the GM's control, and the player takes a new PC if one is available. Players are urged to wait for the third act.", [27, 158], {
    ...M,
    tags: ["cinematic", "gm"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.act-showdown"] },
  }),
  card("cinematic-lethality", "Death in cinematic play", "Cinematic adventures are brutal: most PCs will probably not live to the end, and memorable deaths are part of the story. Treat a death as a dramatic peak, make the most of it, and get the player back into the action quickly.", [18, 69], {
    ...M,
    tags: ["cinematic", "gm"],
    links: { rules: ["alien.rule.critical-injuries", "alien.rule.death", "alien.rule.gm-principles"] },
  }),
];
