/**
 * The GM's table-side play guide: what each attribute and skill does for the
 * story, the moments that call for it, and how success, failure and a push
 * should move the scene. Story advice is the module's own wording; every rule
 * fact it leans on cites the printed page of the Evolved Edition core rules
 * (checked in docs/verification/play-guide.md). Paraphrase only, never book prose.
 *
 * `roll` is the skill id from SKILL_BINDINGS, or `attr:<id>` for the two
 * attributes the book rolls on their own (Strength and Empathy). Agility and
 * Wits are never rolled alone in the core rules, so their entries have no roll.
 */
import type { PlayGuideDef, PlayGuideEntry, PlayGuideGroup } from "@campaign-forge/module-sdk";

export const PLAY_GUIDE_ID = "alien.play-guide";

const groups: PlayGuideGroup[] = [
  { id: "strength", label: "Strength", summary: "Muscle and endurance: forcing machines, fighting up close, and keeping the body going when it wants to quit.", page: 25 },
  { id: "agility", label: "Agility", summary: "Speed and control: shooting, dodging, climbing and flying when a slip costs lives.", page: 25 },
  { id: "wits", label: "Wits", summary: "Alertness and know-how: spotting the threat, working the tech, and reading a hostile environment.", page: 25 },
  { id: "empathy", label: "Empathy", summary: "People: talking them round, keeping them steady under fire, and keeping them alive.", page: 25 },
];

const attributes: PlayGuideEntry[] = [
  {
    id: "strength",
    label: "Strength",
    group: "strength",
    kind: "attribute",
    roll: "attr:strength",
    summary: "Drives Heavy Machinery, Stamina and Close Combat, and half of Health (p. 67). Rolled alone only where a rule says so.",
    callFor: [
      "A Roughneck with Resilient takes damage: roll Strength alone, and each six cancels a point of damage (p. 50).",
      "Someone reels in a struggling target on a harpoon tether (p. 87).",
      "A threat is backed by muscle rather than charm: the GM may pair Strength with Manipulation (p. 43).",
    ],
    success: "The body wins: the hit is shrugged off, the target is hauled in, the threat lands.",
    failure: "The full hit lands or the line slips. Go straight to the consequence and the next decision.",
    push: "Resilient cannot be pushed (p. 50). On Strength-based skill rolls, the Frantic stress response costs two dice (p. 44) and True Grit allows a second push (p. 50).",
    examples: ["That claw connects. Roll your Strength and tell me how many sixes soak it."],
    page: 25,
  },
  {
    id: "agility",
    label: "Agility",
    group: "agility",
    kind: "attribute",
    summary: "Drives Mobility, Piloting and Ranged Combat, and half of Health (p. 67). The core rules never roll it on its own.",
    callFor: [
      "Speed, balance or a steady hand decides the moment: reach for Mobility, Piloting or Ranged Combat.",
      "The ground itself fights back: on low- or high-gravity worlds, Agility rolls lose two dice until the crew acclimatizes (p. 237).",
      "A PC has the Shakes: every Agility-based roll is down two dice (p. 44).",
    ],
    success: "They are quicker than the danger: they reach the hatch, clear the gap or fire first.",
    failure: "The danger gets there first: lost ground, a wasted round, or a worse position to act from.",
    push: "A Kid with Nimble can push Agility-based rolls twice, at +1 stress each time (p. 50).",
    examples: ["How fast can you move in that suit? Show me."],
    page: 25,
  },
  {
    id: "wits",
    label: "Wits",
    group: "wits",
    kind: "attribute",
    summary: "Drives Observation, Survival and Comtech, and half of Resolve (p. 26). The core rules never roll it on its own.",
    callFor: [
      "Something is wrong and nobody has said what: Observation finds it, Comtech pulls it off the system.",
      "The place itself is the threat (heat, cold, thin air, no sleep): call for Survival.",
      "Stress is mounting: Resolve, Wits plus Empathy halved and rounded up, is subtracted from stress and panic rolls (p. 26).",
      "A PC has Tunnel Vision: Wits-based rolls are down two dice (p. 44).",
    ],
    success: "They understand before it is too late: give a clue, a warning or a way through.",
    failure: "They see it late or read it wrong. Reveal the danger as it arrives, not before.",
    push: "A Scientist with Inquisitive can push Wits-based rolls twice (p. 50). Cunning lets Manipulation use Wits (p. 50) and Stoic does the same for Stamina (p. 51).",
    examples: ["You know this system better than anyone here. What looks off to you?"],
    page: 25,
  },
  {
    id: "empathy",
    label: "Empathy",
    group: "empathy",
    kind: "attribute",
    roll: "attr:empathy",
    summary: "Drives Manipulation, Command and Medical Aid, and half of Resolve (p. 26). Rolled alone for the damage fear leaves behind.",
    callFor: [
      "The session is over and a PC rolled 9 or more on a panic roll: Empathy alone, no push, or a mental trauma sets in (p. 74).",
      "On shore leave a PC works through a trauma: an unpushed Empathy roll removes one on a success (campaign play, p. 257).",
      "A lone survivor leans on NPC companions to stop a panic: an Empathy roll (solo play, p. 300).",
    ],
    success: "They hold together. Play a short scene that shows what it cost them.",
    failure: "Something stays with them: roll D66 on the mental trauma table and give the player something to roleplay (p. 74).",
    push: "Neither the trauma check nor the shore-leave recovery roll can be pushed (pp. 74, 257). On Empathy-based skill rolls, Aggravated costs two dice (p. 44).",
    examples: ["You saw what happened in the medbay. Roll Empathy, no push, and we'll see what stays with you."],
    page: 25,
  },
];

const skills: PlayGuideEntry[] = [
  // Strength
  {
    id: "heavyMachinery",
    label: "Heavy Machinery",
    group: "strength",
    kind: "skill",
    roll: "heavyMachinery",
    summary: "Using, fixing, jury-rigging or wrecking big machines: loaders, torches, engines, reactors.",
    callFor: [
      "Something is coming through the ducts: weld the access point shut with a cutting torch (full action, one try per stretch, p. 56).",
      "A weapon jams mid-fight; clearing it is a full action (p. 60).",
      "A wrecked vehicle must run again: one repair roll per shift, each six removes 1 damage (p. 79).",
      "The engines are cold and an enemy ship is closing: powering them up takes a roll, one try per stretch (p. 141).",
      "The engineer wants more speed than the FTL drive was built for: a shift of work, and failure starts a reactor leak (p. 108).",
    ],
    success: "The machine does the job: the duct is sealed, the engine starts, the way is open. Spend extra sixes on speed or silence.",
    failure: "The job is not done yet: time passes, noise carries, or something else gives way. An overcharge failure means a leak and another roll at once (p. 108).",
    push: "+1 stress, re-roll every die not showing a six (p. 43). Worth offering when the threat is one stretch away. A Roughneck with True Grit can push Strength rolls twice (p. 50).",
    examples: [
      "It's in the vent right above you and the torch is in your hand. Roll Heavy Machinery.",
      "The engines are cold and that ship is getting closer. Who's on the reactor?",
    ],
    page: 46,
  },
  {
    id: "closeCombat",
    label: "Close Combat",
    group: "strength",
    kind: "skill",
    roll: "closeCombat",
    summary: "Fighting at Adjacent range with fists, blades or the butt of a rifle, and defending against it.",
    callFor: [
      "Something gets within arm's reach and a PC fights instead of running.",
      "A PC wants to disarm, pass a blocker, shove or grapple: pick it from the special attacks in the combat panel and declare it before rolling (p. 62).",
      "A locked door must come down: a close combat attack at +2 dice against armor 2 and 10 points of damage (p. 61).",
      "The enemy is restrained or unaware: +2 dice, and they cannot defend (p. 64).",
      "An attack is coming: the target may defend as a quick action, declared before the attacker rolls (p. 62).",
    ],
    success: "The blow lands for weapon damage plus 1 per extra six (p. 62), or the special attack works: weapon dropped, foe shoved, path clear.",
    failure: "The foe stays close and acts next: they hit back, grab hold, or the door still stands while the noise draws company.",
    push: "+1 stress for another swing. A defender may push too, since the target of an opposed roll can (p. 44). NPCs never push (p. 42).",
    examples: [
      "It has you by the collar. Are you fighting it or pulling free?",
      "Roll Close Combat to defend before I roll for the claws.",
    ],
    page: 46,
  },
  {
    id: "stamina",
    label: "Stamina",
    group: "strength",
    kind: "skill",
    roll: "stamina",
    summary: "Physical endurance when the body itself is tested, from fever to the edge of death.",
    callFor: [
      "A lethal critical injury reaches its time limit: the death roll is Stamina, not an action, with no push and no stress dice (p. 68).",
      "Someone drags a broken crewmate out: a Stamina roll, or both stay in the zone (p. 61).",
      "A stun weapon hits: Stamina at minus the damage, or lose the next turn (p. 71).",
      "The crew was exposed to a contagion: a passive Stamina roll modified by virulence, perhaps rolled in secret (p. 76).",
    ],
    success: "The body holds: they stay conscious, stay alive, carry the weight, or beat the sickness for now.",
    failure: "The cost is physical and immediate: a lost turn, a friend left behind, a fever that brings fatigue (p. 76), or on a death roll, death.",
    push: "Stun rolls can be pushed (p. 71); death rolls and disease rolls cannot (pp. 68, 76). Three death rolls passed without help and the PC lives (p. 71).",
    examples: [
      "Your time is up on that wound. Roll Stamina, base dice only, no push.",
      "Hayes is down and it's coming back. Can you haul him out of here?",
    ],
    page: 46,
  },
  // Agility
  {
    id: "rangedCombat",
    label: "Ranged Combat",
    group: "agility",
    kind: "skill",
    roll: "rangedCombat",
    summary: "Shooting from Short range or farther, with line of sight and something to fire or throw.",
    callFor: [
      "A target is in sight and someone pulls the trigger (full action, p. 64).",
      "There is a moment to line up the shot: aiming is a quick action for +2 dice, taken right before firing (p. 64).",
      "The fight is aboard ship: a miss by an outer bulkhead it could breach makes the GM roll a stress die, and a facehugger breaches the hull (p. 75).",
      "Someone hoses the room on full auto: each hit allows another roll, up to three, at +1 stress per extra roll (p. 67).",
      "A friend stands next to the target, so a miss may hit them (p. 66).",
    ],
    success: "The shot lands for weapon damage plus 1 per extra six, or one extra six skips the ammo roll (p. 67).",
    failure: "The round goes somewhere: the bulkhead, a fuel line, the friend beside the target. Then roll for ammo supply (p. 66).",
    push: "+1 stress for one more chance; a push ends a full-auto burst (p. 67). The ammo supply roll still follows the attack (p. 66).",
    examples: [
      "You've got a clear line down the corridor. Aim first, or fire now?",
      "You missed. I'm rolling a stress die for the hull behind it.",
    ],
    page: 46,
  },
  {
    id: "mobility",
    label: "Mobility",
    group: "agility",
    kind: "skill",
    roll: "mobility",
    summary: "Risky movement: climbs, jumps, dodges and getting out of the way in time.",
    callFor: [
      "The way out is up a shaft, across a gap or along a ledge (a jump or climb is a full action in combat, p. 60).",
      "Shots are coming and the PC knows where from: dodge as a quick action, declared before the attack roll (p. 65).",
      "Air is venting and someone has to get into a suit fast: a full action and a Mobility roll (p. 75).",
      "The gravity is off: every move needs a Mobility roll, and failure leaves them spinning with +1 stress (p. 76).",
      "Someone is burning: they or an Adjacent friend can put it out with Mobility as a full action (p. 76).",
    ],
    success: "They get where they need to be, or out of harm's way, before the threat closes.",
    failure: "They only half make it: stuck halfway, spinning, or taking the fall. In a controlled jump each six still cuts fall damage by 1 (p. 75).",
    push: "+1 stress to try again. In a suit, a Mobility roll also calls for an air supply roll (p. 28). A Kid with Nimble pushes Agility rolls twice, and Hard to Catch adds +2 to dodges (p. 50).",
    examples: [
      "The ladder's gone. It's a three-meter jump to the next catwalk. Mobility.",
      "It's raising the gun at you. Dodge, or shoot back?",
    ],
    page: 46,
  },
  {
    id: "piloting",
    label: "Piloting",
    group: "agility",
    kind: "skill",
    roll: "piloting",
    summary: "Hard maneuvers at the helm of any spacecraft, and ground vehicles once the driving gets difficult.",
    callFor: [
      "A chase is on and ordinary driving is no longer enough (normal driving needs no roll, p. 78).",
      "The ship must set down on a rough world: a shift and a Piloting roll per attempt (p. 109).",
      "In space combat the navigation officer accelerates, decelerates, rams or docks, modified by Thrusters (p. 143).",
      "Someone rams a target with a vehicle: Piloting plus Maneuverability (p. 79).",
      "A hit throws the vehicle into a severe spin: an immediate Piloting roll, or it is wrecked (p. 79).",
    ],
    success: "The craft goes where they want: the gap opens or closes, the landing holds, the ram connects.",
    failure: "Damage the craft before the crew. Planetfall is the model: a first failure brings minor component damage, then the crew may abort or try again with more at stake (p. 109).",
    push: "+1 stress, re-roll. Full Throttle gives +2 to accelerate or decelerate, and Like the Back of Your Hand +2 in one model (p. 50).",
    examples: [
      "The ridge is coming up fast and the APC is still on your tail. What do you do?",
      "Planetfall in this storm takes the whole shift. Roll Piloting.",
    ],
    page: 46,
  },
  // Wits
  {
    id: "observation",
    label: "Observation",
    group: "wits",
    kind: "skill",
    roll: "observation",
    summary: "Spotting what sneaks, searching a zone, and learning what an unknown threat is.",
    callFor: [
      "Someone or something comes into line of sight in stealth mode: a passive, open, opposed roll, asked for without saying why (p. 56).",
      "The crew searches a room for something hidden: a stretch of searching, and each six turns up one thing (pp. 57-58).",
      "A PC stands guard for a whole stretch: +2 dice to spot anything that comes into view (p. 56).",
      "A strange creature or device is in front of them and they want to know more about it (p. 46).",
      "Someone slipped out of a fight unseen: their enemies roll Observation to follow (p. 61).",
    ],
    success: "Tell them something true and useful: where it is, what it is doing, what they nearly missed. Extra sixes reveal more.",
    failure: "They miss it or see it too late. The other side wins the moment and picks: ambush, hide, back away or reveal itself (p. 56).",
    push: "Passive rolls cannot be pushed and trigger no stress responses, though stress dice still roll (p. 44). An active search can be pushed, or tried again next stretch (p. 57). Darkness costs two dice without a flashlight (p. 57).",
    examples: ["Roll Observation for me. No reason.", "You have one stretch to search the lab before they're back. What are you looking for?"],
    page: 46,
  },
  {
    id: "survival",
    label: "Survival",
    group: "wits",
    kind: "skill",
    roll: "survival",
    summary: "Holding out in a hostile place: heat, cold, storms, no air, hunger and no sleep.",
    callFor: [
      "The crew crosses a frozen or scorching wasteland without proper gear: Survival at intervals the GM sets (p. 75).",
      "The air runs out or someone is under water: a roll every round (p. 75).",
      "A full day without food and water, or without sleep, has passed: a roll every shift (p. 75).",
      "Someone is in vacuum: +1 stress each round and a roll before every action, each one harder (p. 75).",
      "The hull is breached and the draft tears at everyone: a roll on their turn to act at all (p. 75).",
    ],
    success: "They keep going for now. Grant them one more interval and make them use it.",
    failure: "The first failure makes them fatigued: no Health recovery, more rolls, and every later failure is 1 damage and +1 stress. Only fixing the cause ends it (p. 75).",
    push: "+1 stress to stay on their feet; becoming fatigued raises stress as well (p. 72). Androids never become fatigued (p. 75).",
    examples: ["It's forty below and the crawler's heater is dead. Roll Survival for the stretch.", "Your suit alarm is screaming. Survival before you do anything else."],
    page: 46,
  },
  {
    id: "comtech",
    label: "Comtech",
    group: "wits",
    kind: "skill",
    roll: "comtech",
    summary: "Programming, repairing, decrypting or bending computers, terminals, comms and androids.",
    callFor: [
      "An electronically locked door stands between them and safety: Comtech, full action (p. 61).",
      "The answers are buried in the mainframe and someone has to dig them out (working a terminal is a full action, p. 60).",
      "The ship's computer fights back: an opposed roll against its Comtech (p. 44).",
      "A damaged android needs a shift of repair work, or a shut-down one a stretch of work to talk again (p. 78).",
      "In space combat the science officer locks onto an enemy ship or evades a lock (p. 143).",
    ],
    success: "The system gives them what they want: the door opens, the logs play, the lock holds, the android speaks.",
    failure: "The system answers its own way: an alarm, a lockout, a wiped log or a long wait. Someone may notice the intrusion.",
    push: "+1 stress for another pass at the code. Tunnel Vision costs two dice on Wits-based rolls (p. 44).",
    examples: ["The door was sealed from the bridge. You can try the override from here. Comtech, full action.", "Mother isn't letting you in. Roll Comtech against hers."],
    page: 46,
  },
  // Empathy
  {
    id: "manipulation",
    label: "Manipulation",
    group: "empathy",
    kind: "skill",
    roll: "manipulation",
    summary: "Bringing someone round to your view with lies, threats or patient persuasion.",
    callFor: [
      "An NPC has what the crew needs (a code, a seat on the shuttle, silence) and will not just hand it over.",
      "The other side argues back: make it an opposed Manipulation roll (p. 47).",
      "Before rolling, weigh the negotiating position: each factor in their favor or against them is +1 or −1 die (p. 47).",
      "The crew has to stall or bluff a Company rep before the truth comes out.",
    ],
    success: "They agree, within reason. Manipulation is not mind control, and the GM can rule out an unreasonable ask (p. 47).",
    failure: "They refuse, or agree at a price: a favor owed, a report filed, a suspicion that comes back later.",
    push: "+1 stress for a second pitch. The target of an opposed roll may push too; between PCs the active side decides first (p. 44).",
    examples: [
      "She has the shuttle codes. What do you offer her, and what does it cost her to say yes?",
      "He's on a crackling radio channel. That's a die off.",
    ],
    page: 47,
  },
  {
    id: "command",
    label: "Command",
    group: "empathy",
    kind: "skill",
    roll: "command",
    summary: "Leading under pressure: ending panic, giving orders and getting the fallen back up.",
    callFor: [
      "A crewmate is panicking: anyone within speaking range, comms included, can roll Command to end it (a full action in combat, p. 72).",
      "A crewmate is broken in the same zone: rally them as a quick action (p. 68).",
      "The squad needs direction in a firefight: give an order as a full action (p. 60).",
      "In space combat the executive officer opens each stretch with orders (p. 143).",
    ],
    success: "The panic ends. A rallied PC is back up with 1 Health per six (p. 68). Each six on an order is +1 die to one later roll that round that carries it out (p. 60).",
    failure: "The panic runs on until a stretch passes or something worse happens (p. 72). A failed rally does nothing, and the fight goes on without them (p. 69).",
    push: "+1 stress for the one giving orders, so the leader burns out first. A rally does nothing for critical injuries (p. 68). Field Commander makes orders a quick action and Frontline Leader adds +2 to rallies (p. 50).",
    examples: ["She's frozen in the corner and you're on comms. Roll Command and tell her what to do.", "Bark the order. Every six is a die for the next shot."],
    page: 46,
  },
  {
    id: "medicalAid",
    label: "Medical Aid",
    group: "empathy",
    kind: "skill",
    roll: "medicalAid",
    summary: "First aid for the dying and the broken, surgery, nursing the sick, and examining bodies.",
    callFor: [
      "A crewmate is broken: first aid at Adjacent range (full action, medical gear helps) gets them up with 1 Health per six (p. 68).",
      "A lethal critical injury has the death-roll clock running: stabilize the patient before a death roll fails (p. 71).",
      "An injury needs surgery before it can heal: a shift of work and a Medical Aid roll (p. 71).",
      "A crewmate is sick: a carer's Medical Aid takes the place of their Stamina rolls (p. 77).",
      "There is a body, or something that was inside one, and someone wants to examine it (p. 47).",
    ],
    success: "The patient is stabilized and stops making death rolls (p. 71), or the examination gives a real clue about what did this.",
    failure: "On a lethal injury the time limit drops one step, shift to stretch to round, and at round the patient dies (p. 71). Make the room feel it.",
    push: "+1 stress to keep working. You can treat yourself at −2 dice if you are not broken (p. 71). First aid cannot stop death rolls from fatigue (p. 75). Field Medic and Surgeon each add +2 (p. 50).",
    examples: [
      "He's bleeding out on the table and it gets worse if you miss. Medical Aid.",
      "The chest is open from the inside. What do you want to know?",
    ],
    page: 47,
  },
];

export const playGuide: PlayGuideDef = {
  id: PLAY_GUIDE_ID,
  title: "Rolls in the story",
  intro:
    "What each attribute and skill does for the story, and when to reach for it. Story advice is the module's own; the rules it relies on cite the printed page.",
  tips: [
    {
      text: "Save rolls for tense moments where failure would change the scene. The book warns against rolling too often, and NPC actions that do not touch a PC need no roll at all: just decide.",
      page: 42,
    },
    {
      text: "Failure never stops the story. Keep a way forward and charge for it in time, risk or W-Y dollars.",
      page: 43,
    },
    {
      text: "Extra sixes buy more than damage: speed, silence, style or a bonus effect. Use them to hand the players something they did not ask for, like a trail into the air shafts.",
      page: 43,
    },
    {
      text: "Pushing is the player's call: +1 stress, re-roll every die not showing a six, once. No push if the first roll showed a facehugger on a stress die. Each push adds a stress die, and with it the odds of a stress response.",
      page: 43,
    },
    {
      text: "One roll per attempt. A retry needs something new (time, gear, help) and the clock moves: the rules pace retries, such as one search roll per stretch (p. 57) or one vehicle repair roll per shift (p. 79).",
    },
    {
      text: "Up to three helpers add +1 die each, but only if they can really contribute; in combat it costs the helper's full action. A Paranoid PC can neither help nor be helped (p. 73).",
      page: 43,
    },
    {
      text: "Use opposed rolls sparingly, when someone actively resists. More sixes wins, and the target may push as well.",
      page: 44,
    },
    {
      text: "Let a passive roll warn the table: ask for Observation without saying why. Passive rolls cannot be pushed and trigger no stress responses, but stress dice still count.",
      page: 44,
    },
    {
      text: "Tie rolls to the clock. In a countdown, time is a consumable: after each combat round a supply roll eats minutes off the timer.",
      page: 55,
    },
    {
      text: "Know each PC's agenda and build rolls that test it. Advancing it at real risk earns a story point in cinematic play or bonus XP in campaign play (pp. 27, 158).",
      page: 152,
    },
  ],
  groups,
  entries: [...attributes, ...skills],
};
