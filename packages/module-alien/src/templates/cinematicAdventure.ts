import type { Template, TemplateAct, TemplateAdventure } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { ACT_DEFAULTS, DEFAULT_TARGET_HOURS, DEFAULT_YEAR } from "../narrative";

const agendaHandouts = (act: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    title: `Agenda for <PC ${i + 1}> (Act ${act})`,
    body: "_This PC's secret agenda for the act. Hand it out at the start of the act; it is not written on the character sheet._",
    visibility: "some_players" as const,
  }));

/**
 * Cinematic adventure scaffold following the book's structure (p. 157-158): player
 * introduction, the situation, characters with an agenda per act, locations, three acts
 * of events (a few mandatory, most optional and stand-alone) and an epilogue.
 * Empty until the GM writes into it.
 */
export const cinematicAdventureScaffold: TemplateAdventure = {
  title: "<Scenario title>",
  premise: "_The characters: each PC and key NPC with stats, background and one agenda per act. Locations: the mapped core area with key locations marked and described._",
  playerIntro: "What's the story, Mother?\n\n_Read aloud by the GM at the start: just enough for the players to get going._",
  gmSituation: "_The situation: a short GM-only overview of what is really going on behind the scenes._",
  acts: [
    {
      number: 1,
      title: "Setup",
      goal: "Introduce the PCs and NPCs and establish the conflicts. Hand out the first agendas.",
      pacing: "Start easy and add complications slowly; hint at the danger rather than showing it (dread). Agendas for acts I and II should not call for open moves against other PCs.",
      scenes: [
        { purpose: "Arrival: the crew and the place are introduced (mandatory event).", mandatory: true, body: "_Who is present, what the crew is here to do._" },
        { purpose: "Warning signs: something is wrong (optional event).", mandatory: false, body: "_Stand-alone; use it if the PCs go looking._" },
        { purpose: "Agenda hook: a scene aimed at one PC's agenda (optional event).", mandatory: false, body: "_Which PC, what it tempts them to do._" },
      ],
      handouts: agendaHandouts(1),
    },
    {
      number: 2,
      title: "Tilt",
      goal: "Something unexpected raises the stakes and the danger; secrets are revealed. New agendas for every PC.",
      pacing: "Increase the pressure, then let them breathe before the next blow (terror). Story Points for agendas followed at risk are awarded at the end of the act.",
      scenes: [
        { purpose: "The tilt: the unexpected turn (mandatory event).", mandatory: true, body: "_What happens, who sees it, which panic rolls it triggers._" },
        { purpose: "Revelation: a secret comes out (optional event).", mandatory: false, body: "_Whose secret, how it surfaces._" },
        { purpose: "Running low: resources run short (optional event).", mandatory: false, body: "_Air, ammo, power or time; what the PCs must choose._" },
      ],
      handouts: agendaHandouts(2),
    },
    {
      number: 3,
      title: "Showdown",
      goal: "Bring the story to a climactic resolution that depends on what the PCs do. Last agendas; PvP, if any, belongs here.",
      pacing: "The threat is revealed (horror). Let things go wrong all at once; a countdown suits this act. Call PvP when a conflict passes the point of no return.",
      scenes: [
        { purpose: "Showdown: the confrontation (mandatory event).", mandatory: true, body: "_Where it happens, the zone map, what is at stake._" },
        { purpose: "Countdown: a race against disaster (optional event).", mandatory: false, body: "_What starts it and how many minutes it runs._" },
        { purpose: "Last temptation: a final pull on one agenda (optional event).", mandatory: false, body: "_Who is tempted, and what it costs the others._" },
      ],
      handouts: agendaHandouts(3),
    },
  ],
  epilogue: "_A suggested sign-off message from one of the PCs, if anyone survives; the player reads it aloud or adapts it to what happened._",
};

export const cinematicAdventureTemplate: Template = {
  id: "alien.template.cinematic-adventure",
  kind: "adventure",
  name: "Cinematic adventure",
  description: "Player introduction, situation, characters and locations, three acts (Setup, Tilt, Showdown) of mandatory and optional events with per-act agenda handouts, and an epilogue (p. 157-158).",
  mode: [CINEMATIC],
  page: [157, 158],
  scaffold: cinematicAdventureScaffold,
};

/** A template act that also seeds the module's act fields (see narrative.ts). */
export type BuilderTemplateAct = TemplateAct & { fields: Record<string, unknown> };

/**
 * The bare frame the guided cinematic builder starts from: three empty acts
 * (Setup, Tilt, Showdown) with the default act lengths (75, 100 and 65 minutes)
 * and fear stages (dread, terror, horror), one blank event each, and no
 * placeholder text, so the builder's review sees an empty draft. `fields` on
 * the adventure and on each act seed the module's narrative fields.
 */
export const cinematicBuilderScaffold: Omit<TemplateAdventure, "acts"> & { fields: Record<string, unknown>; acts: BuilderTemplateAct[] } = {
  title: "",
  fields: { year: DEFAULT_YEAR, theme: "killing-greed", targetHours: DEFAULT_TARGET_HOURS, signOffs: {} },
  acts: ACT_DEFAULTS.map((d, i) => ({
    number: i + 1,
    title: "",
    goal: "",
    fields: { minutes: d.minutes, fearStage: d.fearStage },
    scenes: [{ purpose: "", mandatory: false }],
  })),
};

export const cinematicBuilderTemplate: Template = {
  id: "alien.template.cinematic-builder",
  kind: "adventure",
  name: "Cinematic adventure (guided builder)",
  description: "Empty three-act frame for the guided cinematic builder: 75, 100 and 65 minute acts set to dread, terror and horror, one blank event each (p. 155, 157).",
  mode: [CINEMATIC],
  page: [155, 158],
  scaffold: cinematicBuilderScaffold,
};
