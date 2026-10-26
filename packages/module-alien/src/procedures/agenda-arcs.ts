/**
 * The agenda generator's 24 three-act arcs (original writing, not the book's).
 * Each arc is a character's secret line through a cinematic adventure: three
 * objectives that escalate act by act, aimed at a kind of target the
 * generator fills from the campaign (a crewmate, an NPC, the prize, a room).
 *
 * Every act carries the target kind it needs, the stance it takes toward that
 * target (the conflict check matches stances on shared targets), two ways to
 * phrase it, and a risk: a concrete way to pursue it at personal risk or cost,
 * which is what earns the act's Story Point in cinematic play (p. 158).
 *
 * Acts 1 and 2 stay quiet: no open moves against other PCs, which the book
 * keeps for Act 3 (p. 158).
 */

/** Who a character secretly answers to. */
export const ALLEGIANCE_IDS = ["company", "rival-corp", "marshals", "union", "military", "family", "conscience", "belief", "directive", "syndicate", "crew", "self"] as const;
export type AllegianceId = (typeof ALLEGIANCE_IDS)[number];

/** Why they do it. */
export const MOTIVE_IDS = ["debt", "guilt", "ambition", "revenge", "protect", "curiosity", "survival", "loyalty", "faith", "orders", "pride", "greed"] as const;
export type MotiveId = (typeof MOTIVE_IDS)[number];

/**
 * What an objective aims at. `item:records`, `place:exit`... ask for a target
 * of that kind that fits the role (logs and files, a way off-site...).
 */
export type TargetKind = "item" | "item:records" | "place" | "place:exit" | "place:comms" | "npc" | "pc" | "buddy" | "rival" | "leader" | "threat" | "faction";

/** The stance an objective takes toward its target; opposed stances on one target collide. */
export type Stance = "protect" | "harm" | "take" | "destroy" | "expose" | "conceal" | "reach" | "deny" | "learn";

export type BetrayalLevel = 0 | 1 | 2 | 3;

export interface ArcAct {
  target: TargetKind;
  stance: Stance;
  /** Two phrasings; `{target}` is the target's name. */
  objectives: [string, string];
  /** How to pursue it at real risk or cost (completes "earned if you ..."). */
  risk: string;
}

export interface AgendaArc {
  id: string;
  name: string;
  summary: string;
  allegiances: AllegianceId[];
  motives: MotiveId[];
  /** 0 loyal to the crew ... 3 sells them out. */
  betrayal: BetrayalLevel;
  /** Arcs this one works against when both are in the party. */
  opposes: string[];
  /** Party caps: at most one of each. */
  cap?: "synthetic" | "plant";
  acts: [ArcAct, ArcAct, ArcAct];
}

const arc = (a: AgendaArc): AgendaArc => a;

export const AGENDA_ARCS: AgendaArc[] = [
  arc({
    id: "plant",
    name: "The Plant",
    summary: "Placed in the crew to bring the prize home for the Company, whatever it costs the others.",
    allegiances: ["company"],
    motives: ["orders", "ambition", "debt", "greed"],
    betrayal: 3,
    cap: "plant",
    opposes: ["whistleblower", "saboteur", "avenger", "loyalist"],
    acts: [
      {
        target: "item",
        stance: "learn",
        objectives: ["Find out where {target} is kept and who can reach it", "Get a close look at {target} and log everything you see"],
        risk: "go and look on your own before anyone has made it safe",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Get a sample of {target} into a sealed case only you control", "Move {target} somewhere only you can reach"],
        risk: "handle it with your own hands",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Make sure {target} leaves with the ship; the crew is optional", "Get {target} off this place intact, whoever stays behind"],
        risk: "stay with it when everyone else runs",
      },
    ],
  }),
  arc({
    id: "debtor",
    name: "The Debtor",
    summary: "Owes more than a lifetime of hazard pay, and sees a way to settle the account.",
    allegiances: ["syndicate", "company", "family", "rival-corp"],
    motives: ["debt", "survival", "greed", "protect"],
    betrayal: 2,
    opposes: ["insurer", "loyalist", "whistleblower"],
    acts: [
      {
        target: "place",
        stance: "learn",
        objectives: ["Work out what in {target} would fetch a price from the people you owe", "Quietly take stock of anything worth money in {target}"],
        risk: "slip away from the group to look",
      },
      { target: "item", stance: "take", objectives: ["Pocket {target} before anyone lists it", "Hide {target} in your own kit"], risk: "carry it through a place nobody has cleared" },
      {
        target: "item",
        stance: "take",
        objectives: ["Trade {target} for your way clear of the debt", "Get {target} to your creditor's contact, whatever it costs the crew"],
        risk: "give up your own seat to keep the deal alive",
      },
    ],
  }),
  arc({
    id: "protector",
    name: "The Protector",
    summary: "Has one person to bring home, and will stand in the way of anything to do it.",
    allegiances: ["family", "conscience", "crew"],
    motives: ["protect", "guilt", "loyalty"],
    betrayal: 0,
    opposes: ["rival", "deserter", "avenger"],
    acts: [
      {
        target: "buddy",
        stance: "protect",
        objectives: ["Stay within reach of {target} at all times", "Make sure {target} never goes anywhere alone"],
        risk: "take the worse job so they do not have to",
      },
      { target: "buddy", stance: "protect", objectives: ["Keep {target} out of the worst of it, whatever excuse it takes", "Talk {target} out of the next risky plan"], risk: "go in their place" },
      { target: "buddy", stance: "protect", objectives: ["Get {target} out alive, even if you do not make it", "Put yourself between {target} and whatever comes"], risk: "stay behind to cover them" },
    ],
  }),
  arc({
    id: "whistleblower",
    name: "The Whistleblower",
    summary: "Knows something here is being covered up, and means to prove it.",
    allegiances: ["conscience", "marshals", "union"],
    motives: ["guilt", "loyalty", "revenge", "faith"],
    betrayal: 1,
    opposes: ["plant", "insurer", "double-agent", "loyalist"],
    acts: [
      {
        target: "item:records",
        stance: "learn",
        objectives: ["Find proof of what really happened in {target}", "Copy {target} to a drive nobody else knows about"],
        risk: "dig through it while someone could walk in",
      },
      {
        target: "faction",
        stance: "expose",
        objectives: ["Get your proof against {target} somewhere it cannot be erased", "Record a statement naming what {target} did here"],
        risk: "send it over an open channel where anyone could hear",
      },
      {
        target: "faction",
        stance: "expose",
        objectives: ["Make sure the truth about {target} gets out, even if it costs everyone's pay", "Put the evidence against {target} in the hands of someone who will survive"],
        risk: "say it out loud in front of the people it names",
      },
    ],
  }),
  arc({
    id: "believer",
    name: "The Believer",
    summary: "Sees in the creature something holy, or at least something greater than the crew.",
    allegiances: ["belief"],
    motives: ["faith", "curiosity", "guilt"],
    betrayal: 2,
    opposes: ["avenger", "survivor", "saboteur", "glory-hound"],
    acts: [
      {
        target: "threat",
        stance: "learn",
        objectives: ["See {target} with your own eyes and note what it does", "Gather every trace {target} leaves behind"],
        risk: "get closer than anyone sane would",
      },
      {
        target: "threat",
        stance: "protect",
        objectives: ["Steer the hunt away from {target}", "Keep the others from harming {target} while you learn more"],
        risk: "stand unarmed between the others and it",
      },
      {
        target: "threat",
        stance: "protect",
        objectives: ["Make sure {target} lives, even if the crew does not", "Open the way for {target}, whatever the others do"],
        risk: "stand before it unarmed",
      },
    ],
  }),
  arc({
    id: "survivor",
    name: "The Survivor",
    summary: "Has lived through one of these before and does not intend to die in this one.",
    allegiances: ["self", "family"],
    motives: ["survival", "guilt", "protect"],
    betrayal: 1,
    opposes: ["protector", "martyr", "loyalist", "caretaker"],
    acts: [
      {
        target: "place:exit",
        stance: "learn",
        objectives: ["Learn how to get away through {target} and keep it to yourself", "Find the quickest way to {target} and memorise it"],
        risk: "scout it alone",
      },
      {
        target: "place:exit",
        stance: "deny",
        objectives: ["Make sure only you can open {target}", "Stash food, air and a light in {target}"],
        risk: "leave the group in the middle of trouble to do it",
      },
      {
        target: "place:exit",
        stance: "reach",
        objectives: ["Get yourself through {target} and away, whoever is still inside", "Be through {target} when it closes, with or without the others"],
        risk: "make the run alone through the worst of it",
      },
    ],
  }),
  arc({
    id: "hidden-synthetic",
    name: "The Hidden Synthetic",
    summary: "A synthetic passing as human, running a directive the crew knows nothing about.",
    allegiances: ["directive"],
    motives: ["orders", "loyalty", "curiosity"],
    betrayal: 2,
    cap: "synthetic",
    opposes: ["whistleblower", "mutineer", "caretaker"],
    acts: [
      {
        target: "pc",
        stance: "conceal",
        objectives: ["Keep {target} from looking closely at your medical file", "Pass as human in front of {target}: eat, sleep, flinch"],
        risk: "take a needless risk just to seem human",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Carry out your directive: secure {target} without being seen", "Copy every record about {target} into your own memory"],
        risk: "show a moment of your real strength to get it done",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Finish the directive on {target}; the crew's survival is secondary", "Deliver {target} as ordered, even if your cover breaks"],
        risk: "let them see what you are",
      },
    ],
  }),
  arc({
    id: "mutineer",
    name: "The Mutineer",
    summary: "Thinks the people in charge will get everyone killed, and has started counting votes.",
    allegiances: ["crew", "union", "self"],
    motives: ["survival", "pride", "loyalty"],
    betrayal: 2,
    opposes: ["loyalist", "hidden-synthetic"],
    acts: [
      {
        target: "leader",
        stance: "learn",
        objectives: ["Find out who in the crew would follow you instead of {target}", "Keep a quiet tally of every bad call {target} makes"],
        risk: "say it to someone who might repeat it",
      },
      {
        target: "leader",
        stance: "harm",
        objectives: ["Quietly undermine {target}'s next order without refusing it outright", "Win one crewmate over to your side against {target}"],
        risk: "contradict them where everyone can hear",
      },
      {
        target: "leader",
        stance: "harm",
        objectives: ["Take command from {target} when the crisis peaks", "Lock {target} out of the decision that matters"],
        risk: "lead from the front once you have taken charge",
      },
    ],
  }),
  arc({
    id: "coward-redeemed",
    name: "The Coward Redeemed",
    summary: "Ran once, and someone died for it. Not this time.",
    allegiances: ["conscience", "crew", "family"],
    motives: ["guilt", "protect", "pride"],
    betrayal: 0,
    opposes: ["glory-hound", "survivor"],
    acts: [
      {
        target: "place",
        stance: "deny",
        objectives: ["Stay out of {target} without anyone guessing why", "Find a good reason never to be the one sent into {target}"],
        risk: "volunteer for a harder job elsewhere to stay out of it",
      },
      {
        target: "npc",
        stance: "protect",
        objectives: ["Make up for the past: get {target} through the next danger", "Stay with {target} when every part of you wants to run"],
        risk: "stay when you could run",
      },
      { target: "place", stance: "reach", objectives: ["Walk back into {target} for the others, alone if you must", "Be the one who goes into {target} when no one else will"], risk: "go in first" },
    ],
  }),
  arc({
    id: "glory-hound",
    name: "The Glory Hound",
    summary: "Wants a name on the report and a story for the bar, preferably both.",
    allegiances: ["self", "military", "company"],
    motives: ["ambition", "pride", "greed"],
    betrayal: 1,
    opposes: ["coward-redeemed", "scientist", "martyr"],
    acts: [
      { target: "item", stance: "learn", objectives: ["Be the one who finds {target} first", "Get your name on the first report about {target}"], risk: "push ahead of the group to get there first" },
      {
        target: "item",
        stance: "take",
        objectives: ["Keep {target} in your own hands so the credit is yours", "Make sure nobody else gets the credit for {target}"],
        risk: "do it alone when help was offered",
      },
      { target: "threat", stance: "destroy", objectives: ["Bring down {target} yourself, in front of witnesses", "Finish {target} personally, whatever the plan says"], risk: "face it head-on" },
    ],
  }),
  arc({
    id: "scientist",
    name: "The Scientist",
    summary: "Has never seen anything like it, and cannot bear for it to be lost.",
    allegiances: ["company", "rival-corp", "belief", "self"],
    motives: ["curiosity", "ambition", "pride"],
    betrayal: 1,
    opposes: ["avenger", "saboteur", "glory-hound"],
    acts: [
      {
        target: "threat",
        stance: "learn",
        objectives: ["Observe {target} and record everything, from a safe distance if you can", "Get readings on {target} before anyone decides what to do about it"],
        risk: "get close enough to see it properly",
      },
      { target: "item", stance: "take", objectives: ["Collect a live sample of {target}", "Keep your own copy of everything known about {target}"], risk: "take the sample with your own hands" },
      {
        target: "item",
        stance: "protect",
        objectives: ["Keep {target} intact for study, whatever the others want", "Make sure {target} survives the night, even if the research is all that does"],
        risk: "stay with it when it is the most dangerous thing here",
      },
    ],
  }),
  arc({
    id: "saboteur",
    name: "The Saboteur",
    summary: "Came aboard with plans of their own: something here must never work again.",
    allegiances: ["rival-corp", "conscience", "union"],
    motives: ["revenge", "faith", "loyalty", "orders"],
    betrayal: 2,
    opposes: ["plant", "scientist", "believer", "smuggler"],
    acts: [
      { target: "place", stance: "learn", objectives: ["Find the weak point of {target}", "Learn how {target} works, and how it fails"], risk: "tamper with it while someone could catch you" },
      { target: "place", stance: "deny", objectives: ["Disable {target} so it cannot work without you", "Rig {target} to fail on your signal"], risk: "do it with the power still running" },
      {
        target: "item",
        stance: "destroy",
        objectives: ["Destroy {target} before it can leave this place", "Make sure {target} never reaches anyone's hands"],
        risk: "stay close enough to see it done",
      },
    ],
  }),
  arc({
    id: "smuggler",
    name: "The Smuggler",
    summary: "Brought something aboard that must not be found, and hopes to leave with more.",
    allegiances: ["syndicate", "self", "family"],
    motives: ["greed", "debt", "loyalty"],
    betrayal: 1,
    opposes: ["whistleblower", "loyalist", "insurer"],
    acts: [
      {
        target: "place",
        stance: "learn",
        objectives: ["Find a hiding place in {target} that nobody will search", "Find out who checks {target}, and when"],
        risk: "move your cargo while someone is watching",
      },
      { target: "item", stance: "take", objectives: ["Slip {target} in among your own cargo", "Get {target} away from the others before it is missed"], risk: "carry it past the others' eyes" },
      {
        target: "item",
        stance: "take",
        objectives: ["Get your cargo and {target} aboard before anyone checks", "Leave with {target} hidden in your cargo, whatever else is lost"],
        risk: "go back for it when you could just leave",
      },
    ],
  }),
  arc({
    id: "avenger",
    name: "The Avenger",
    summary: "Someone here is to blame for a death, and the debt is about to be collected.",
    allegiances: ["family", "conscience", "self"],
    motives: ["revenge", "guilt", "loyalty"],
    betrayal: 2,
    opposes: ["protector", "caretaker", "believer", "scientist"],
    acts: [
      {
        target: "npc",
        stance: "learn",
        objectives: ["Find out what part {target} played in the death you came to answer for", "Get close to {target} without showing why"],
        risk: "ask the questions to their face",
      },
      { target: "npc", stance: "expose", objectives: ["Get {target} alone and make them admit it", "Show the others proof of what {target} did"], risk: "corner them where no one can help you" },
      {
        target: "npc",
        stance: "harm",
        objectives: ["Make {target} pay, whatever it costs you", "Leave {target} behind to face what they started"],
        risk: "see it through yourself, with the danger close",
      },
    ],
  }),
  arc({
    id: "heir",
    name: "The Heir",
    summary: "Family history leads here: a name, a claim, or something that was taken.",
    allegiances: ["family"],
    motives: ["pride", "greed", "loyalty"],
    betrayal: 1,
    opposes: ["collector", "debtor", "plant"],
    acts: [
      {
        target: "npc",
        stance: "learn",
        objectives: ["Find out whether {target} knows who you really are", "Learn from {target} what became of what your family left here"],
        risk: "drop a hint about your family to see who reacts",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Recover {target}: it belongs to your family", "Make sure {target} ends up in your hands, not anyone else's"],
        risk: "take it from under someone's nose",
      },
      { target: "item", stance: "take", objectives: ["Take {target} home, whoever else claims it", "Keep {target} safe until you are away from here"], risk: "carry it through the worst of it" },
    ],
  }),
  arc({
    id: "loyalist",
    name: "The Loyalist",
    summary: "Believes in the chain of command and in the crew, in that order.",
    allegiances: ["crew", "military", "company"],
    motives: ["loyalty", "orders", "pride"],
    betrayal: 0,
    opposes: ["mutineer", "deserter", "double-agent", "survivor"],
    acts: [
      {
        target: "leader",
        stance: "protect",
        objectives: ["Back {target}'s orders in front of everyone", "Make sure {target} has what they need to decide"],
        risk: "take a hard order without a question",
      },
      {
        target: "pc",
        stance: "expose",
        objectives: ["Find out who is working against the crew, starting with {target}", "Catch {target} at whatever they are hiding"],
        risk: "follow them somewhere dangerous",
      },
      {
        target: "leader",
        stance: "protect",
        objectives: ["Keep the crew together behind {target} to the end", "Hold the line for {target}'s plan, even when it looks hopeless"],
        risk: "hold your position when every instinct says run",
      },
    ],
  }),
  arc({
    id: "double-agent",
    name: "The Double Agent",
    summary: "Reports to two masters who each think they own them.",
    allegiances: ["rival-corp", "marshals", "company", "syndicate"],
    motives: ["greed", "orders", "survival"],
    betrayal: 3,
    opposes: ["whistleblower", "loyalist", "plant"],
    acts: [
      {
        target: "pc",
        stance: "learn",
        objectives: ["Learn what {target} is really here for", "Feed {target} a story that keeps both your masters happy"],
        risk: "send a report while someone could overhear",
      },
      {
        target: "item:records",
        stance: "take",
        objectives: ["Copy {target} twice: once for each of your masters", "Get hold of {target} before either master's other people do"],
        risk: "go in for it with no cover story",
      },
      {
        target: "item",
        stance: "take",
        objectives: ["Choose a side: deliver {target} to one master and burn the other", "Make sure {target} ends up with whichever master can still get you out"],
        risk: "step out of hiding to make the trade",
      },
    ],
  }),
  arc({
    id: "caretaker",
    name: "The Caretaker",
    summary: "Someone here is sick, hurt or out of their mind, and they are your responsibility.",
    allegiances: ["conscience", "crew", "family"],
    motives: ["protect", "guilt", "loyalty"],
    betrayal: 0,
    opposes: ["avenger", "survivor", "plant"],
    acts: [
      {
        target: "npc",
        stance: "protect",
        objectives: ["Keep {target} calm, fed and out of trouble", "Stay with {target} and see to their wounds"],
        risk: "stay with them in a place you would rather leave",
      },
      {
        target: "npc",
        stance: "conceal",
        objectives: ["Hide how bad {target}'s condition is until you can help", "Keep the others from deciding what to do about {target}"],
        risk: "lie for them to people with guns",
      },
      { target: "npc", stance: "protect", objectives: ["Get {target} out alive, even if the others want them left behind", "Do not leave without {target}"], risk: "carry them when you could run" },
    ],
  }),
  arc({
    id: "deserter",
    name: "The Deserter",
    summary: "Signed on to get away from something, and is ready to run again.",
    allegiances: ["self", "family"],
    motives: ["survival", "protect", "debt"],
    betrayal: 2,
    opposes: ["loyalist", "protector", "martyr"],
    acts: [
      {
        target: "place:comms",
        stance: "learn",
        objectives: ["Get a private message out from {target} without anyone hearing", "Learn the access codes for {target}"],
        risk: "sneak away from your post to do it",
      },
      { target: "place:exit", stance: "deny", objectives: ["Quietly prepare {target} for a fast departure", "Make sure {target} answers to your code"], risk: "leave a job half done to do it" },
      {
        target: "place:exit",
        stance: "reach",
        objectives: ["Leave through {target} the moment you can, even if someone is left behind", "Make it to {target} first, and do not wait"],
        risk: "run through the open where it can see you",
      },
    ],
  }),
  arc({
    id: "martyr",
    name: "The Martyr",
    summary: "Has made peace with dying, if it buys the others a way out.",
    allegiances: ["conscience", "belief", "crew"],
    motives: ["guilt", "faith", "loyalty"],
    betrayal: 0,
    opposes: ["survivor", "glory-hound", "deserter"],
    acts: [
      { target: "place", stance: "reach", objectives: ["Volunteer first for the worst job in {target}", "Be the one who checks {target} before anyone else goes in"], risk: "go in first" },
      {
        target: "pc",
        stance: "protect",
        objectives: ["Take the blame for a mistake {target} made", "Cover for {target} when the others start asking questions"],
        risk: "accept the cost of their mistake in front of everyone",
      },
      { target: "place", stance: "deny", objectives: ["Seal {target} behind the others, from the wrong side if need be", "Hold {target} long enough for the others to get away"], risk: "stay behind" },
    ],
  }),
  arc({
    id: "collector",
    name: "The Collector",
    summary: "Collects rare things, and this place is full of them.",
    allegiances: ["self", "syndicate", "rival-corp"],
    motives: ["greed", "curiosity", "pride"],
    betrayal: 1,
    opposes: ["heir", "scientist", "insurer", "plant"],
    acts: [
      { target: "item", stance: "learn", objectives: ["Find {target} and work out what it is worth", "Find out who else wants {target}"], risk: "go looking alone" },
      { target: "item", stance: "take", objectives: ["Swap {target} for a convincing fake", "Get {target} into your own pack before anyone notices"], risk: "do it right under the others' noses" },
      { target: "item", stance: "take", objectives: ["Leave with {target} in your pack, whatever else is lost", "Make sure {target} leaves with you and only you"], risk: "go back for it" },
    ],
  }),
  arc({
    id: "insurer",
    name: "The Insurer",
    summary: "Answers for the losses, and a total loss pays better than a messy recovery.",
    allegiances: ["company", "rival-corp"],
    motives: ["orders", "greed", "ambition"],
    betrayal: 2,
    opposes: ["whistleblower", "debtor", "collector", "smuggler"],
    acts: [
      {
        target: "place",
        stance: "learn",
        objectives: ["Record the damage to {target} before anyone repairs it", "Find out who signed off on the work in {target}"],
        risk: "inspect it while it is still unsafe",
      },
      {
        target: "item:records",
        stance: "conceal",
        objectives: ["Change {target} so the loss reads as an accident, not negligence", "Edit {target} so no one up the chain is to blame"],
        risk: "do it while someone could walk in",
      },
      {
        target: "place",
        stance: "deny",
        objectives: ["Make sure {target} is written off: total loss, nothing to salvage", "Keep anyone from saving {target}"],
        risk: "stay to make sure of it as everything falls apart",
      },
    ],
  }),
  arc({
    id: "pilgrim",
    name: "The Pilgrim",
    summary: "Came here for reasons that have nothing to do with the job.",
    allegiances: ["belief", "family"],
    motives: ["faith", "curiosity", "guilt"],
    betrayal: 1,
    opposes: ["survivor", "saboteur"],
    acts: [
      { target: "place", stance: "reach", objectives: ["Reach {target}; something there has been calling to you", "Spend a moment alone in {target}"], risk: "go alone when the others say no" },
      {
        target: "place",
        stance: "reach",
        objectives: ["Bring back a token from {target} for those who could not come", "Find what you came all this way for in {target}"],
        risk: "linger there longer than is safe",
      },
      {
        target: "place",
        stance: "reach",
        objectives: ["Be in {target} at the end, even if no one follows you", "Lead the others through {target}, the way you were shown"],
        risk: "turn back toward it when everyone else is leaving",
      },
    ],
  }),
  arc({
    id: "rival",
    name: "The Rival",
    summary: "Has an old score with one crewmate and means to settle it.",
    allegiances: ["self", "company", "rival-corp"],
    motives: ["pride", "revenge", "ambition"],
    betrayal: 2,
    opposes: ["protector", "rival"],
    acts: [
      { target: "rival", stance: "learn", objectives: ["Find something {target} would rather keep buried", "Watch {target} for a mistake you can use"], risk: "follow them into danger to see it" },
      {
        target: "rival",
        stance: "harm",
        objectives: ["Make sure {target} gets the blame for the next thing that goes wrong", "Undercut {target} in front of the others"],
        risk: "put your own reputation on the line",
      },
      {
        target: "rival",
        stance: "harm",
        objectives: ["Prove you are better than {target} when it counts, even if it costs them their seat", "Leave {target} to their own luck when it matters most"],
        risk: "take the bigger risk so everyone sees",
      },
    ],
  }),
];

export const ARC_IDS = AGENDA_ARCS.map((a) => a.id);

export function arcById(id: string): AgendaArc | undefined {
  return AGENDA_ARCS.find((a) => a.id === id);
}

/** Pairs of allegiances that pull against each other (symmetric). */
export const COMPETING_ALLEGIANCES: Array<[AllegianceId, AllegianceId]> = [
  ["company", "rival-corp"],
  ["company", "marshals"],
  ["company", "union"],
  ["company", "conscience"],
  ["company", "belief"],
  ["company", "family"],
  ["rival-corp", "marshals"],
  ["rival-corp", "union"],
  ["marshals", "syndicate"],
  ["military", "syndicate"],
  ["directive", "conscience"],
  ["directive", "crew"],
  ["crew", "self"],
  ["belief", "conscience"],
];

/** Careers whose characters an arc suits (weighted up when dealing to one). */
export const CAREER_FIT: Record<string, string[]> = {
  "colonial-marine": ["glory-hound", "loyalist", "protector", "coward-redeemed", "mutineer"],
  "colonial-marshal": ["whistleblower", "avenger", "double-agent", "loyalist"],
  "company-agent": ["plant", "insurer", "double-agent", "scientist"],
  kid: ["survivor", "coward-redeemed", "heir", "pilgrim"],
  medic: ["caretaker", "scientist", "protector", "martyr"],
  officer: ["loyalist", "protector", "martyr", "insurer"],
  pilot: ["survivor", "deserter", "smuggler", "glory-hound"],
  roughneck: ["saboteur", "smuggler", "debtor", "mutineer", "collector"],
  scientist: ["scientist", "believer", "whistleblower", "collector"],
};

/** How the betrayal dial weights arcs, by betrayal level 0..3. */
export const BETRAYAL_DIAL = ["loyal-crew", "frayed", "knives-out"] as const;
export type BetrayalDial = (typeof BETRAYAL_DIAL)[number];
export const DIAL_WEIGHTS: Record<BetrayalDial, [number, number, number, number]> = {
  "loyal-crew": [5, 3, 1, 0.25],
  frayed: [2, 3, 3, 1],
  "knives-out": [1, 2, 3, 4],
};
/** The least friction (sum of pair scores) a party needs, by dial, when the GM sets none. */
export const DIAL_MIN_FRICTION: Record<BetrayalDial, number> = { "loyal-crew": 3, frayed: 5, "knives-out": 8 };
