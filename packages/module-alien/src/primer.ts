/**
 * Campaign primer prompts and starter text. The starter text is Campaign
 * Forge's own words: a short overview of the game's tone and its corporate
 * frontier, written for this app (no book prose; the core rules have no open
 * licence). The GM edits all of it before sharing.
 */
import type { PrimerDef } from "@campaign-forge/module-sdk";

export const primer: PrimerDef = {
  sections: [
    {
      id: "welcome",
      title: "Welcome",
      prompt: "The pitch: who the characters are (a crew, a colony team, marines), what job brings them together, and the kind of trouble waiting for them.",
      original: true,
    },
    {
      id: "setting",
      title: "The frontier",
      prompt: "The corner of space the game is set in: the colonies, stations or ship routes, who holds the charters, and how far away help is.",
      starter: [
        "Humanity has spread thin across a frontier of colonies, outposts, mining claims and long shipping lanes. Corporations hold the charters, run the ports and own most of what moves between the stars; governments are far away and slow to care.",
        "Ships are old and patched, crews are small, contracts are tight, and the nearest help is weeks of cryosleep away. Most people out here work for someone else and owe more than they earn. Out past the lit routes, some things are not on any chart.",
      ].join("\n\n"),
      original: true,
    },
    {
      id: "lore",
      title: "What everyone knows",
      prompt: "Common knowledge: the companies everyone has heard of, recent incidents in the news, rumours from the docks. Leave the truth for play.",
      original: true,
    },
    {
      id: "places",
      title: "Places and outfits you've heard of",
      prompt: "Stations, colonies, ports and the companies or factions the characters know by name, one line each.",
      original: true,
    },
    {
      id: "tone",
      title: "Tone and content",
      prompt: "How dark and how frightening the game gets, lines and veils, and the safety tools at the table.",
      starter: [
        "This is a game of dread and hard choices. The characters are working people, not heroes: often outgunned, rarely told the whole story, and right to be afraid. Stress piles up, trust breaks, and not everyone makes it home.",
        "- **Lines** (never in the game): ",
        "- **Veils** (happen off screen): ",
        "- **Safety tools**: an X-card on the table; anyone can pause or rewind a scene, no reason needed.",
      ].join("\n\n"),
      original: true,
    },
    {
      id: "house-rules",
      title: "House rules",
      prompt: "Rules you change or add, and table habits: dice, phones, breaks, scheduling.",
      original: true,
    },
    {
      id: "characters",
      title: "Making your character",
      prompt: "Campaign or cinematic play, pregenerated characters or your own, careers you allow, and how the crew knows each other.",
      starter: "Pick a career and decide what your character wants out of this job, who on the crew they trust and who they don't, and what they would never tell the company.",
      original: true,
    },
    {
      id: "opening",
      title: "Where we begin",
      prompt: "The opening situation: the ship or station, the contract, and the first thing that goes wrong.",
      original: true,
    },
  ],
};
