import type { RuleCard } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { F, TR, card } from "./card";

const M = { mode: [CINEMATIC] };

export const cinematicPlayRules: RuleCard[] = [
  card("three-acts", "Cinematic three-act structure", "A cinematic scenario runs in three acts: Setup introduces the crew and the situation, Tilt turns it on its head, Showdown forces the ending. Each act has mandatory and optional events and a new agenda per character.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.act-setup", "alien.rule.act-tilt", "alien.rule.act-showdown", "alien.rule.cinematic-agendas"] },
  }),
  card("act-setup", "Act one: Setup", "Establish the characters, the place and the job; let the players feel the normal before it breaks. Seed the clues that pay off later.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts"] },
  }),
  card("act-tilt", "Act two: Tilt", "Something reverses the situation: the threat is revealed, the plan fails, an ally turns. Agendas start to collide and the first blood is spilled.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.calling-pvp"] },
  }),
  card("act-showdown", "Act three: Showdown", "Everything comes to a head with a hard deadline: a countdown, a last shuttle, a self-destruct. Agendas resolve, survivors are few, and the epilogue says what became of them.", 157, {
    ...M,
    tags: ["cinematic", "structure"],
    links: { rules: ["alien.rule.three-acts"], trackers: [TR.countdown] },
  }),
  card("pregenerated-characters", "Pregenerated characters", "Cinematic scenarios ship with ready-made characters whose agendas and secrets are part of the plot. Players pick rather than build.", 24, {
    ...M,
    tags: ["cinematic", "character"],
    links: { rules: ["alien.rule.play-modes"] },
  }),
  card("cinematic-agendas", "Agendas per act", "Each character receives a secret agenda handout at the start of every act. Pursuing it earns a Story Point; agendas are written to pull the crew in different directions.", 27, {
    ...M,
    tags: ["cinematic", "character"],
    links: { fields: [F.agendas, F.storyPoints], rules: ["alien.rule.story-point-award", "alien.rule.agendas"] },
  }),
  card("story-point-award", "Earning Story Points", "At the end of each act, a character who visibly pursued their agenda gains one Story Point, up to a maximum of three.", [27, 44], {
    ...M,
    tags: ["cinematic", "dice"],
    links: { fields: [F.storyPoints], rules: ["alien.rule.story-points"], trackers: [TR.storyPoints] },
  }),
  card("calling-pvp", "Calling PvP", "When one player's character turns on the others, the GM calls PvP: the traitor becomes an NPC run by the GM for the fight, and the player may take over another role or watch the consequences.", 158, {
    ...M,
    tags: ["cinematic", "gm"],
    links: { rules: ["alien.rule.three-acts"] },
  }),
  card("cinematic-lethality", "Lethality in cinematic play", "Cinematic characters are meant to die. Do not soften critical injuries, let countdowns run out, and keep a spare pregen for a player whose character is gone.", 157, {
    ...M,
    tags: ["cinematic", "gm"],
    links: { rules: ["alien.rule.critical-injuries", "alien.rule.death"] },
  }),
];
