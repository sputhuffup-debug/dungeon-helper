# Experience, Story Points and spending XP

Checked against the Evolved Edition core rules: chapter 2 (personal agendas, buddies and rivals, skills and talents at creation, signature items, developing your character, printed p. 26-30), skills and talents in chapter 3 (p. 42, 48-51), the Story Points box of chapter 4 (p. 44), cinematic play in chapter 7 (p. 158) and shore leave in chapter 11 (p. 257). Page references are printed folios.

## What the book says

| Topic | Pages | What the module does with it |
|---|---|---|
| XP after each session | 30 | Nine questions, one XP per yes, at most one XP per question; the group discusses and the GM decides when it cannot agree. The module's award checklist (`alien.award.*`) has the nine, paraphrased, each worth 1 XP. Attendance starts ticked; the panic question starts ticked when the session's stress tracker logged a panic roll for the PC. |
| Agenda bonus XP | 27, 30 | The campaign agenda rule on p. 27 is the second question on p. 30 (risk or sacrifice for the agenda), not an extra point. The question only applies to a PC with an agenda on the sheet. |
| Buddy and rival questions | 30 | Apply to a PC with a `buddy_of` / `rival_of` relationship (or the free-text field). |
| Spending XP | 30 | Only between sessions: the app warns when a session is running, and lets the GM go ahead. |
| Skill cost | 30 | One step at a time; the step costs the new level × 5 XP (2 → 3 costs 15, the book's example, is a test). |
| New skill | 30 | Level 0 → 1 costs 5 XP and needs a success with the skill this session (rolled without a level), or a teacher with level 1+ for at least a shift. The app cannot see either, so the GM confirms it. |
| Skill cap | 26, 42 | Skill levels run 0-5. |
| Talent cost and choice | 30, 48-51 | Any new talent costs 5 XP: one of your own career's or a general talent. Career talents of other careers are listed as unavailable. |
| Stacking talents | 51 | Hardened and Seen It All can be taken up to three times. Like the Back of Your Hand and Weapon Specialist can be taken "several times, once per model"; the module keeps its existing cap of 99 for those. |
| Changing buddy and rival | 30 | After any session; shown as a note in the wrap-up and on the Progression tab. |
| Shore leave, Pursue Agenda | 257 | A week of shore leave spent on the agenda earns 1 XP if it succeeds. The shore leave procedure now awards it through the module's downtime award question, so it lands in the advancement log. |
| Story Points: use | 44, 158 | In a cinematic adventure, spend one to get a success on one base die of a skill roll, before or after pushing. The existing `storyPoint` dice operation does this; the roll panel offers it. |
| Story Points: maximum | 44 | Never more than 3. Awards over the cap are logged with the points lost to it. |
| Story Points: earning | 27, 158 | At the end of each act, a PC who advanced their (hidden) agenda despite personal risk or significant sacrifice gets one, announced without saying why. One award question with `timing: "act"`, awarded once per act and PC. |
| Story Points: carry over | 158 | One leftover point may come along to the group's next cinematic adventure (GM's discretion), even with a new PC. "End of adventure" on the Progression tab keeps one and logs the change. |
| Cinematic play and XP | 30, 44 | The XP chapter is written for campaign play; Story Points belong to cinematic adventures. So XP and the spend options apply in campaign mode, Story Points in cinematic mode. |
| Signature items, cash | 28, 30 | No advancement rules beyond the money question; cash stays on the sheet and in the ledger. |
| NPCs | 30, 42 | The development rules address PCs; NPCs never push and have no stress level. Only PCs advance. |

The solo Last Survivor mode (p. 291) replaces session XP with objective XP; it is not part of this module.

## Stored or derived

XP and Story Points stay stored fields on the sheet (`xp`, `storyPoints`): the book has players write their XP down and cross it off, cap Story Points at three and carry one over, so they are running pools like stress, not values computed from other fields. Every award and spend made in the app moves the pool and appends an entry to the core advancement log in the same transaction. Lifetime totals (earned, spent) are summed from the log on read and never stored.

## Files

| File | What |
|---|---|
| `packages/module-alien/src/progression.ts` | Pools, the nine XP questions, the act Story Point award, the shore leave award, the skill and talent spend options |
| `packages/module-alien/src/procedures/shore-leave.ts` | Pursue Agenda awards XP through the log |
| `packages/module-alien/src/hooks.ts` | End-of-session prompts keep only the trauma check |
| `packages/module-alien/src/templates/sessionChecklist.ts` | "Go through the XP questions" ticks when the awards are posted |

## Checks

A 10-word shingle check of every new and changed line of text (code, data, tests and this document) against the book's text found no matches, and no purchase watermark text.
