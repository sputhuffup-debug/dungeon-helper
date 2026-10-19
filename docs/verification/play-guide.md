# Play guide: verification against the Evolved Edition core rules

File: `packages/module-alien/src/guides.ts` (`alien.play-guide`, "Rolls in the story").
Checked in October 2026 against the owner's copy. Page numbers are printed folios.

The story advice (cues, what success and failure should open up, the lines to say aloud) is the module's own. Only the rule facts below come from the book, and they are paraphrased.

## Shape

- 4 groups (Strength, Agility, Wits, Empathy), summaries from the attribute definitions (p. 25).
- 16 entries: 4 attributes and 12 skills. Skill entries use the `SKILL_BINDINGS` id as `roll`, the attribute as `group` and the `alien.skills` name as `label`. Each skill entry cites its description page: p. 46, or p. 47 for Manipulation and Medical Aid.
- 10 tips.
- No `mode` tags. No skill works differently in cinematic and campaign play. The few rules that belong to one mode say so in the text: story points (cinematic, p. 158), agenda XP (campaign, p. 27) and shore-leave trauma recovery (campaign, p. 257).

## Attribute-only rolls

The book rolls an attribute alone only in these cases, so only Strength and Empathy get a `roll`:

| Attribute | Roll | Page |
|---|---|---|
| Strength | Resilient talent, which soaks damage and cannot be pushed | 50 |
| Strength | Pulling a resisting target on a harpoon tether | 87 |
| Empathy | Mental trauma check after the session, unpushed, after a panic result of 9+ | 74 |
| Empathy | Shore-leave Recover activity, unpushed (campaign) | 257 |
| Empathy | Solo play: NPC survivors help stop panic | 300 |

No Agility-only or Wits-only roll was found. A search of the whole text for each attribute name next to "roll" turned up nothing. Rolling without the skill (p. 43) still counts as a skill roll at level 0, so it uses the skill's id.

## Rule facts checked

| Topic | Fact used | Page |
|---|---|---|
| When to roll | Save rolls for tense moments; NPCs roll only when they affect a PC | 42 |
| Failure | Never a dead end; the cost is time, risk or W-Y dollars | 43 |
| Extra successes | Speed, quiet, show, bonus effect | 43 |
| Push | +1 stress, re-roll dice not showing a success, once; no push after a facehugger on the first roll | 43 |
| Helping | Up to three helpers, +1 die each, full action in combat; Paranoid blocks it (p. 73) | 43 |
| Opposed, passive | Used sparingly; the target may push. Passive rolls cannot be pushed and trigger no stress response, but stress dice still roll | 44 |
| Stress responses | Frantic, Shakes, Tunnel Vision and Aggravated each cost two dice on rolls of one attribute | 44 |
| Resolve, Health | Resolve is (Wits + Empathy) / 2 rounded up; Health is (Strength + Agility) / 2 rounded up | 26, 67 |
| Talents cited | Resilient, True Grit, Nimble, Hard to Catch, Inquisitive, Cunning, Full Throttle, Like the Back of Your Hand, Field Commander, Frontline Leader, Field Medic, Surgeon (p. 50); Stoic (p. 51) | 50-51 |
| Heavy Machinery | Seal an access point with a torch (full action, one try per stretch); clear a jam (full action); vehicle repair (one roll per shift, 1 damage per success); power ship engines up (one try per stretch); overcharging (a shift, a leak on failure) | 56, 60, 79, 141, 108 |
| Close Combat | Special attacks declared before rolling; defend as a quick action declared first; locked door: +2 dice, armor 2, 10 damage; +2 dice and no defense against restrained or unaware foes | 61, 62, 64 |
| Stamina | Death roll: not an action, no push, no stress dice; three successes alone means survival; dragging a body; stun (pushable); disease (passive, virulence) | 61, 68, 71, 76 |
| Ranged Combat | Full action; aim +2 as a quick action right before firing; ammo supply roll; an extra success conserves ammo; full auto (up to three rolls, +1 stress per extra, a push ends it); friendly fire; hull breach on a stress die | 64, 66, 67, 75 |
| Mobility | Jump or climb is a full action; dodge; suit up fast; zero-G moves; putting out a fire; controlled jumps; air supply roll after a Mobility roll | 28, 60, 65, 75, 76 |
| Piloting | Normal driving needs no roll; ramming adds Maneuverability; severe spin; planetfall (a shift per roll, worse damage on each failure); space maneuvers use Thrusters | 78, 79, 109, 143 |
| Observation | Passive, open, opposed detection; keeping guard +2; search a stretch, one find per success; darkness −2; tracking someone who left a fight | 56-58, 61 |
| Survival | Fatigue and its effects; suffocation every round; hunger, thirst and sleep every shift after 24 hours; vacuum; hull-breach draft; androids are immune; fatigue raises stress (p. 72) | 75 |
| Comtech | Electronic locks and terminals (full action); opposed against a mainframe; android repair and reactivation; target lock and evade | 44, 60, 61, 78, 143 |
| Manipulation | Opposed if the target is actively against you; negotiating position ±1 die per factor; not mind control; Strength can stand in for threats (p. 43); the active PC pushes first in PvP (p. 44) | 47 |
| Command | Stop panic within speaking range, comms included (full action in combat); rally (quick action, same zone, 1 Health per success, no effect on critical injuries); orders (+1 die per success to one roll that round); executive officer phase | 60, 68, 69, 72, 143 |
| Medical Aid | First aid (Adjacent, full action, gear helps); stabilizing; failure shortens the time limit one step and kills at round; self-treatment at −2; surgery; caring for the sick; no help against fatigue death rolls | 68, 71, 75, 77 |
| Clock, agendas | Countdown supply roll each round; Fuel Their Agendas; story point or XP for an agenda pursued at risk | 27, 55, 152, 158 |

## Verbatim check

Every string in `guides.ts` with ten or more words was split into lowercase 10-word shingles. These were compared with `book.txt` (layout text) and with a fresh reading-order extraction of the PDF, kept in the scratchpad and not in the repository. There were 0 matches. An 8-word pass also found 0. The purchase watermark does not appear.

## Book inconsistencies (data left unchanged)

- **Stamina and vacuum.** The Stamina description (p. 46) names surviving vacuum. The vacuum rules (p. 75) call for Survival rolls. The guide uses p. 75 and lists vacuum under Survival. The `alien.skills` summary for Stamina still says "survive vacuum", which matches p. 46.
- **Driving.** The full-action list (p. 60) includes driving a vehicle, but the vehicle rules (p. 79) call driving a quick action. The existing `vehicles` rule card follows p. 79. The guide does not say how long driving takes.
