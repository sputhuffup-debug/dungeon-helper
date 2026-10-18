import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";
import { F, TR, card } from "./card";

/** Chapters 1-3: modes, characters, skills and talents (p. 18-51), plus the life path appendix. */
export const coreRules: RuleCard[] = [
  card("play-modes", "Play modes", "The game runs in two modes, and rules that apply to only one carry that mode's icon. Cinematic play is a single-session, movie-style scenario with pregenerated PCs, likely conflict between them and few survivors; campaign play follows player-made PCs over many sessions in one of three frameworks.", 18, {
    tags: ["core", "modes"],
    links: { rules: ["alien.rule.three-acts", "alien.rule.campaign-structure", "alien.rule.job-frames"] },
  }),
  card("character-creation", "Creating a character", "Ten steps: choose a career, set attributes and skills, take a career talent, then pick name, appearance, personal agenda, buddy and rival, gear and a signature item, and roll for cash. Cinematic adventures supply ready-made PCs; the life path appendix is a slower, random alternative.", 24, {
    mode: [CAMPAIGN],
    tags: ["core", "character"],
    links: { fields: [F.career, F.attributes, F.skills], rules: ["alien.rule.careers", "alien.rule.attributes", "alien.rule.life-paths", "alien.rule.pregenerated-characters"] },
  }),
  card("attributes", "Attributes", "Strength, Agility, Wits and Empathy, rated 1 to 5. A new PC spreads 14 points with 2 to 4 in each, except that the career's key attribute may reach 5. Optionally roll four dice, re-rolling 1s and 6s, and assign the results.", 25, {
    tags: ["core", "character"],
    links: { fields: [F.attributes], rules: ["alien.rule.skill-rolls", "alien.rule.androids", "alien.rule.health", "alien.rule.resolve"] },
  }),
  card("androids", "Androids", "After assigning attributes an android adds +3 to two of them, reaching up to 8 in the key attribute and 7 in another. Androids cannot push, have no stress level, never panic, ignore fatigue and use their own damage table. Many pass as human, and a secret android can fake stress and panic rolls.", 25, {
    tags: ["core", "character", "android"],
    links: { fields: [F.android, F.stress], rules: ["alien.rule.push", "alien.rule.stress", "alien.rule.android-damage", "alien.rule.fatigue"] },
  }),
  card("careers", "Careers", "Nine careers: Colonial Marine, Colonial Marshal, Company Agent, Kid, Medic, Officer, Pilot, Roughneck and Scientist. Each gives a key attribute, three key skills, a cash roll, and lists of talents, names, looks, agendas, gear and signature items to choose from or roll on.", [31, 39], {
    tags: ["core", "character"],
    links: { fields: [F.career], rules: ["alien.rule.talents", "alien.rule.cash", "alien.rule.character-creation"] },
  }),
  card("skills", "The twelve skills", "Three skills per attribute: Heavy Machinery, Stamina and Close Combat (Strength); Mobility, Piloting and Ranged Combat (Agility); Observation, Comtech and Survival (Wits); Command, Manipulation and Medical Aid (Empathy). New PCs spread 10 points, up to 3 in career skills and 1 in others.", [26, 47], {
    tags: ["core", "character", "skills"],
    links: { fields: [F.skills], rules: ["alien.rule.skill-rolls", "alien.rule.negotiating-position"] },
  }),
  card("health", "Health", "Maximum Health is Strength plus Agility, halved and rounded up; the Hardened talent raises it. Damage lowers Health, and at zero you are broken.", 26, {
    tags: ["core", "character", "damage"],
    links: { fields: [F.attributes, F.talents], rules: ["alien.rule.broken", "alien.rule.damage-armor"] },
  }),
  card("resolve", "Resolve", "Resolve is Wits plus Empathy, halved and rounded up; the Seen It All talent raises it. It is subtracted from stress response and panic rolls.", 26, {
    tags: ["core", "character", "stress"],
    links: { fields: [F.attributes, F.talents], rules: ["alien.rule.stress-response", "alien.rule.panic-roll"], trackers: [TR.stress] },
  }),
  card("skill-rolls", "Skill rolls", "Roll base dice equal to attribute plus skill level, plus one stress die per stress level. At least one 6 means success. With no skill level you roll the attribute alone, plus any gear bonus.", [42, 43], {
    tags: ["core", "dice"],
    links: { fields: [F.skills, F.attributes, F.stress], rules: ["alien.rule.difficulty", "alien.rule.push", "alien.rule.helping", "alien.rule.stress-response"] },
  }),
  card("switching-attributes", "Switching attributes", "The GM or adventure may pair a skill with a different attribute, such as Strength with Manipulation for a threat, and players may suggest it. Some talents grant a specific swap.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("difficulty", "Modifiers", "Rules and the GM can add or remove base dice, written as +1 die, −2 dice and so on; gear can also modify a roll or be required for it. You always keep at least one base die, and modifiers never change stress dice.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("push", "Pushing a roll", "After a failure, or to get more successes, you may push once: stress level +1 (adding a stress die), then re-roll every die not showing a success. You cannot push if the first roll showed a facehugger on a stress die. Androids and NPCs never push.", 43, {
    tags: ["core", "dice", "stress"],
    links: { fields: [F.stress], rules: ["alien.rule.stress", "alien.rule.stress-response", "alien.rule.androids"], trackers: [TR.stress] },
  }),
  card("helping", "Helping", "Up to three PCs or NPCs who can genuinely contribute each add one base die; the GM has final say. In combat, helping takes your full action for the round.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls"] },
  }),
  card("bonus-effects", "Multiple successes", "Extra successes improve the result: in combat they usually add damage, otherwise they can make the action faster, quieter, showier or add an unexpected benefit. The adventure or GM decides what extras can buy.", 43, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls", "alien.rule.attack-close", "alien.rule.attack-ranged"] },
  }),
  card("opposed-rolls", "Opposed rolls", "Against active resistance both sides roll and you need more successes than your opponent; the target of an opposed roll may also push. Between PCs the active player decides on pushing first. In open rolls with no active side a tie has no winner, or is broken at random.", 44, {
    tags: ["core", "dice"],
    links: { rules: ["alien.rule.skill-rolls", "alien.rule.push", "alien.rule.passive-rolls"] },
  }),
  card("passive-rolls", "Passive rolls", "The GM may call for a roll the PC is unaware of, typically Observation in stealth mode, sometimes in secret. Passive rolls cannot be pushed and never trigger stress responses, but stress dice are still added.", 44, {
    tags: ["core", "dice", "stealth"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.opposed-rolls"] },
  }),
  card("negotiating-position", "Negotiating position", "Manipulation is helped by +1 die for each advantage, such as more people on your side, a cheap request, a hurt opponent, a strong pitch or past help. Each disadvantage costs a die: being outnumbered, asking for something valuable, offering nothing, poor understanding or talking over radio or at a distance.", 47, {
    tags: ["core", "skills", "social"],
    links: { rules: ["alien.rule.skill-rolls", "alien.rule.opposed-rolls"] },
  }),
  card("story-points", "Story Points", "In a cinematic adventure, spend a Story Point to turn one base die into a success, before or after pushing. You earn them by following your personal agenda and can hold at most three.", [44, 158], {
    mode: [CINEMATIC],
    tags: ["core", "dice", "cinematic"],
    links: { fields: [F.storyPoints], rules: ["alien.rule.story-point-award", "alien.rule.cinematic-agendas"], trackers: [TR.storyPoints] },
  }),
  card("talents", "Talents", "Talents are unrated special abilities. Career talents are open only to that career, while general talents are open to everyone; a few, such as Hardened and Seen It All, can be taken more than once. A new PC picks one of three career talents.", [48, 51], {
    tags: ["core", "character"],
    links: { fields: [F.talents], rules: ["alien.rule.careers", "alien.rule.advancement"] },
  }),
  card("signature-item", "Signature item", "Besides normal gear, each PC carries a small keepsake with sentimental value and no practical use, such as a patch, a cap or a photo. It is usually tiny and does not count toward encumbrance.", 28, {
    tags: ["core", "character"],
    links: { fields: [F.signatureItem], rules: ["alien.rule.encumbrance"] },
  }),
  card("cash", "Starting gear and cash", "In campaign play the career gives gear to choose or roll, with two full reloads for any weapon plus ordinary clothes, and a roll for W-Y dollars. In cinematic play the adventure sets the gear.", 27, {
    tags: ["core", "character", "gear"],
    links: { fields: [F.cash, F.gear], rules: ["alien.rule.careers", "alien.rule.living-expenses"] },
  }),
  card("life-paths", "Life paths", "An optional random method: determine human or android, roll origin, early life and a life event, take two attribute points and apply for a career, then serve one to three terms with postings, performance rolls, favors or disasters, talents, gear and paychecks. A psych evaluation and final touches finish the PC; results can be unbalanced.", [282, 289], {
    mode: [CAMPAIGN],
    tags: ["core", "character", "generator"],
    links: {
      tables: ["alien.lifepath.human-or-android", "alien.lifepath.origin", "alien.lifepath.early-life", "alien.lifepath.life-event", "alien.lifepath.favors", "alien.lifepath.disasters", "alien.lifepath.psych-evaluation"],
      rules: ["alien.rule.character-creation", "alien.rule.careers"],
    },
  }),
  card("npcs", "Creating NPCs", "Typical NPCs share the PCs' 14 attribute points, and only androids exceed 5. Give skills only where needed (2 is competent, 3 to 5 expert), talents rarely, and always a name, appearance, trait and goal. Do not track NPC consumables or roll for them unless they act on a PC.", [155, 157], {
    tags: ["core", "gm", "npc"],
    links: { rules: ["alien.rule.npc-presets", "alien.rule.npcs-and-panic"] },
  }),
];
