/**
 * Example Quest's GM play guide: what each attribute and skill is for in
 * moving the story, with cues for when to call for it. Fictional fixture
 * text; `roll` ids match the hero's skills widget (`attr:<id>` for an
 * attribute alone).
 */
import type { PlayGuideDef } from "@campaign-forge/module-sdk";

export const examplePlayGuide: PlayGuideDef = {
  id: "example.guide.table",
  title: "Rolling at the table",
  intro: "Call for a roll when failure would change the scene.",
  tips: [
    { text: "Only roll when both outcomes move the story; otherwise just say yes.", page: 12 },
    { text: "A failure costs something (time, a wound, noise) instead of stopping the quest." },
    { text: "Offer a push when the hero wants it badly; in hardcore play it adds Doom.", page: 44 },
  ],
  groups: [
    { id: "might", label: "Might", summary: "Force, endurance and steel: getting through by strength.", page: 14 },
    { id: "wits", label: "Wits", summary: "Knowing, noticing and slipping by unseen.", page: 14 },
  ],
  entries: [
    {
      id: "might",
      label: "Might",
      group: "might",
      kind: "attribute",
      roll: "attr:might",
      summary: "Raw strength when no skill fits.",
      callFor: ["a door is barred and someone throws a shoulder at it", "the heroes haul something heavy against the clock"],
      success: "The way opens and the scene moves on.",
      failure: "It gives, but loudly: something nearby wakes.",
      push: "Re-roll the misses; the strain may cost a wound.",
      page: 14,
    },
    {
      id: "fight",
      label: "Fight",
      group: "might",
      kind: "skill",
      roll: "fight",
      summary: "Trading blows with a foe who fights back.",
      callFor: ["a bandit blocks the bridge and will not talk", "the heroes defend a camp at night"],
      success: "The foe falls back, flees or yields something.",
      failure: "The foe lands a blow or takes what they came for.",
      push: "Swing again, but a bane on the re-roll means a wound.",
      examples: ["He grins and draws. What do you do?"],
      page: 16,
    },
    {
      id: "lore",
      label: "Lore",
      group: "wits",
      kind: "skill",
      roll: "lore",
      summary: "Old stories, signs and what the ruins once were.",
      callFor: ["the heroes find carvings nobody can read", "a stranger's tale does not add up"],
      success: "Give them a true clue that points somewhere new.",
      failure: "They recall something half right; hint at the danger in it.",
      examples: ["You have seen this mark before. Where?"],
      page: 16,
    },
    {
      id: "sneak",
      label: "Sneak",
      group: "wits",
      kind: "skill",
      roll: "sneak",
      summary: "Moving unseen or unheard past watchers.",
      callFor: ["guards stand between the heroes and the tower", "the heroes want to listen in on a deal"],
      success: "They get close, overhear, or slip past.",
      failure: "Someone looks their way; start the alarm clock.",
      push: "Hold still and try again; time passes.",
      page: 16,
    },
    {
      id: "endure",
      label: "Endure",
      group: "might",
      kind: "skill",
      roll: "endure",
      summary: "Holding out against cold, hunger and the dark.",
      callFor: ["the heroes march through a frozen night"],
      success: "They press on without loss.",
      failure: "Mark a wound or turn back.",
      page: 44,
      mode: ["hardcore"],
    },
  ],
};
