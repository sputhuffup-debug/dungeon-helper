/**
 * Short paraphrases of the GM chapter's eight game principles (p. 152), the three
 * key themes and their sub-themes (p. 19, 153) and the stress-and-horror advice
 * (p. 154-155), kept for future AI prompting. Unused in v1. Never book prose.
 */
export const gmPrinciples: string[] = [
  "Principle 1, Use the Films (p. 152): borrow scenes, places, dialogue and characters from the movies, and let the players do it too.",
  "Principle 2, Limit Resources (p. 152): the crew should always be short of something, like ammo, guns or suits, to force hard choices.",
  "Principle 3, Stay in the Shadows (p. 152): suggest the threat instead of showing it; once it is known, the fear of the unknown is gone.",
  "Principle 4, Increase the Pressure (p. 152): begin calmly, pile on complications like a film building to its finale, and let things fail all at once.",
  "Principle 5, Let Them Breathe (p. 152): give quiet moments to recover and plan, then hit them again while their guard is down.",
  "Principle 6, Fuel Their Agendas (p. 152): know each PC's agenda and build situations that test it.",
  "Principle 7, Bring Horrible Death (p. 152): PCs die, often horribly; make each death memorable and raise the stakes for the survivors.",
  "Principle 8, Reveal the Universe (p. 152): now and then show something vast, beautiful and strange that dwarfs humanity.",
];

export const themes: string[] = [
  "Theme: Space Horror (p. 19, 153): survival against primal fear; sub-themes Space Is Hell (an indifferent universe) and Killing Greed (corporations and nations as the real monsters, sympathy with the working class).",
  "Theme: Sci-Fi Action (p. 19, 153): set pieces, heavy weapons and frantic fights; sub-themes Someone Else's War (the little people fight for the powerful) and Expendable Assets (soldiers are cheap cogs).",
  "Theme: Sense of Wonder (p. 19, 153): lost secrets and ancient mysteries; sub-themes The Origin of Life (where we come from and why) and Old and New Gods (faith answering the void).",
  "Each adventure or campaign mixes the three themes but usually leans on one (p. 19).",
];

export const horrorNotes: string[] = [
  "Stress and horror (p. 154): introduce a terror and let the PCs' own actions raise their stress; use fear of the unknown, loss of control and horrible choices.",
  "Stages of fear (p. 155): build dread often, use terror sparingly, and save the horror of the reveal for late in the session.",
  "Relieving stress (p. 155): calm stretches keep the horror working; once the PCs feel safe, strike again.",
  "Splitting the team (p. 155): allow it, cut between groups quickly and use the separation to scare them.",
];

export const styleNotes: string[] = [...gmPrinciples, ...themes, ...horrorNotes];
