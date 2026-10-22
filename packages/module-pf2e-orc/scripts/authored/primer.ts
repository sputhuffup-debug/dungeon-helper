/**
 * Campaign primer prompts and starter text (original). The ORC core rules
 * carry no setting, so these are generic fantasy prompts; they use no
 * Reserved Material (the pack test scans every pack file for it).
 */
import type { PrimerDef } from "@campaign-forge/module-sdk";

export const primer: PrimerDef = {
  sections: [
    { id: "welcome", title: "Welcome", prompt: "The pitch: what kind of adventures these are and why the party is together.", original: true },
    { id: "setting", title: "The world", prompt: "Your world in a few paragraphs: the region where play begins, who rules it, its gods and magic, and what has gone wrong lately.", original: true },
    { id: "lore", title: "What everyone knows", prompt: "Legends, recent events, rumours from the road and anything a commoner would know. Keep the secrets for play.", original: true },
    { id: "places", title: "Places and factions you've heard of", prompt: "Settlements, ruins and roads, and the guilds, orders and powers the characters know by name, one line each.", original: true },
    { id: "house-rules", title: "House rules", prompt: "Variant rules you use (free archetype, automatic bonus progression, proficiency without level) and table habits.", original: true },
    {
      id: "characters",
      title: "Making your character",
      prompt: "Starting level, which ancestries, heritages, backgrounds, classes and rarities are allowed, and how the party knows each other.",
      starter: "- **Options**: common ancestries, heritages, backgrounds and classes; ask before anything uncommon or rare\n- **Ability boosts**: as the core rules give them\n- **Bring**: a reason to adventure and a tie to one other character",
      original: true,
    },
    { id: "opening", title: "Where we begin", prompt: "Where the party is when the first session starts, and the trouble that brings them together.", original: true },
  ],
};
