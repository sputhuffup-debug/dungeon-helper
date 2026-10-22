/**
 * Campaign primer prompts and starter text (original). The SRD has no
 * setting, so these are generic fantasy prompts the GM fills with their own
 * world.
 */
import type { PrimerDef } from "@campaign-forge/module-sdk";

export const primer: PrimerDef = {
  sections: [
    { id: "welcome", title: "Welcome", prompt: "The pitch: what kind of adventures these are (dungeon delves, a sprawling war, intrigue in one city) and why the party is together.", original: true },
    { id: "setting", title: "The world", prompt: "Your world in a few paragraphs: the land where play begins, who rules it, what magic and the gods are like, and what has gone wrong lately.", original: true },
    { id: "lore", title: "What everyone knows", prompt: "Legends, recent wars, rumours from the road and anything a commoner would know. Keep the secrets for play.", original: true },
    { id: "places", title: "Places and factions you've heard of", prompt: "Towns, roads, ruins and the guilds, orders and powers the characters know by name, one line each.", original: true },
    { id: "house-rules", title: "House rules", prompt: "Critical hits, resting, encumbrance, flanking, potions as a bonus action: anything you play differently from the rules as written.", original: true },
    {
      id: "characters",
      title: "Making your character",
      prompt: "Starting level, how ability scores are made, which races, classes, backgrounds and feats are allowed, and how the party knows each other.",
      starter: "- **Ability scores**: standard array, point buy or rolled (say which)\n- **Allowed options**: the SRD's races, classes and backgrounds, plus any supplements listed here\n- **Advancement**: experience or milestones\n- **Bring**: a reason to adventure and a tie to one other character",
      original: true,
    },
    { id: "opening", title: "Where we begin", prompt: "Where the party is when the first session starts, and the trouble that brings them together.", original: true },
  ],
};
