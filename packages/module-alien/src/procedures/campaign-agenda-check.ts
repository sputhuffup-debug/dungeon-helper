/**
 * The no-betrayal check for campaign agendas: proves, for any deal, that the
 * agendas make friction and never betrayal.
 *
 *  - every goal, beat, secret, friction line and tension step dealt is
 *    campaign material at betrayal level 0-1, never a cinematic arc (no
 *    Company plants, no Hidden Synthetics);
 *  - nothing takes a stance of harm, deny, expose, take, destroy, conceal or
 *    keep-from: not toward a PC, and not at all;
 *  - no secret endangers anyone;
 *  - tension is never above the ladder's cap;
 *  - every PC has at least one friction line with someone (another PC; with
 *    one PC, an NPC or the employer);
 *  - friction is spread out: with three or more PCs nobody is in every line,
 *    and nobody carries more than two lines over the fair share;
 *  - the text guard finds none of the words of betrayal in what was dealt.
 */
import { ARC_IDS } from "./agenda-arcs";
import {
  BANNED_STANCES,
  BEAT_COSTS,
  CAMPAIGN_BETRAYAL_MAX,
  CAMPAIGN_GOALS,
  CONTESTED_THINGS,
  EMBARRASSING_SECRETS,
  FALLBACK_NPCS,
  FALLBACK_PLACES,
  FRICTION_TEMPLATES,
  MOTIVE_TEXT,
  ALLEGIANCE_TEXT,
  TENSION_CAP,
  TENSION_LADDER,
  frictionTemplateById,
  goalById,
  secretById,
  type CampaignStance,
} from "./campaign-agenda-data";

/**
 * The text guard: words and phrases of betrayal and violence against the
 * crew that no campaign agenda may contain.
 */
export const BANNED_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "betray", re: /\bbetray/i },
  { id: "sabotage", re: /\bsabotag/i },
  { id: "kill", re: /\bkill/i },
  { id: "murder", re: /\bmurder/i },
  { id: "sell out", re: /\b(sell|sells|selling|sold)\s+(\w+\s+)?out\b/i },
  { id: "frame", re: /\bframe(d|s)?\b/i },
  { id: "steal", re: /\b(steal|steals|stealing|stole|stolen)\b/i },
  { id: "turn on", re: /\bturn(s|ed|ing)?\s+on\b/i },
  { id: "poison", re: /\bpoison/i },
  { id: "blackmail", re: /\bblackmail/i },
  { id: "keep it from", re: /\bkeep\s+(it|this|that)\s+from\b/i },
  { id: "harm", re: /\bharm/i },
  { id: "hurt", re: /\bhurt/i },
  { id: "double-cross", re: /\bdouble[- ]?cross/i },
  { id: "backstab", re: /\bback-?stab/i },
  { id: "abandon", re: /\babandon/i },
  { id: "leave behind", re: /\bleav(e|es|ing)\s+(\w+\s+){0,2}behind\b/i },
  { id: "maroon", re: /\bmaroon/i },
  { id: "mutiny", re: /\bmutin/i },
  { id: "spy", re: /\bspy(ing)?\b|\bspies\b/i },
  { id: "inform on", re: /\binform(s|ing)?\s+on\b|\brat\s+(\w+\s+)?out\b/i },
  { id: "plant", re: /\bplant(s|ed)?\b/i },
  { id: "hidden synthetic", re: /\bhidden synthetic/i },
  { id: "expose", re: /\bexpos(e|es|ed|ing)\b/i },
  { id: "behind their back", re: /\bbehind\s+(their|his|her|your|the crew's)\s+backs?\b/i },
  { id: "lie to", re: /\blie(s|d)?\s+to\b/i },
  { id: "cheat", re: /\bcheat/i },
  { id: "attack", re: /\battack/i },
  { id: "weapon", re: /\bweapon|\bgun\b|\bknife\b/i },
];

/** The banned words or phrases a text contains (by id). */
export function scanText(text: string): string[] {
  return BANNED_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
}

/** Every piece of campaign agenda material, as text, with where it comes from. */
export function campaignMaterialTexts(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const g of CAMPAIGN_GOALS) {
    out.push({ where: `goal:${g.id}:name`, text: g.name }, { where: `goal:${g.id}:summary`, text: g.summary });
    g.beats.forEach((x, i) => out.push({ where: `goal:${g.id}:beat${i + 1}`, text: x.text }));
  }
  for (const t of FRICTION_TEMPLATES) {
    out.push({ where: `friction:${t.id}:a`, text: t.a });
    if (t.b) out.push({ where: `friction:${t.id}:b`, text: t.b });
  }
  for (const s of EMBARRASSING_SECRETS) out.push({ where: `secret:${s.id}`, text: s.text }, { where: `secret:${s.id}:topic`, text: s.topic });
  for (const s of TENSION_LADDER) out.push({ where: `tension:${s.id}`, text: `${s.label}. ${s.text}` });
  BEAT_COSTS.forEach((c, i) => out.push({ where: `cost:${i + 1}`, text: c }));
  CONTESTED_THINGS.forEach((c, i) => out.push({ where: `thing:${i + 1}`, text: c }));
  for (const [id, m] of Object.entries(MOTIVE_TEXT)) out.push({ where: `motive:${id}`, text: `${m.label}: ${m.why}` });
  for (const [id, a] of Object.entries(ALLEGIANCE_TEXT)) out.push({ where: `allegiance:${id}`, text: `${a.label}: ${a.mine}, ${a.theirs}` });
  FALLBACK_PLACES.forEach((p, i) => out.push({ where: `fallback-place:${i + 1}`, text: p }));
  FALLBACK_NPCS.forEach((p, i) => out.push({ where: `fallback-npc:${i + 1}`, text: p }));
  return out;
}

// ---------------------------------------------------------------------------
// the deal as the check sees it
// ---------------------------------------------------------------------------

export interface CheckedMember {
  id: string;
  name: string;
  goal: string;
  /** Index of the beat dealt in the goal's beats. */
  beat: number;
  /** Whether the beat names a crewmate (a PC). */
  beatNamesPc: boolean;
  secret: string;
  tension: number;
  /** The texts dealt to this PC (goal summary, beat, the friction lines as their handout reads them). */
  texts: string[];
}

export interface CheckedLine {
  key: string;
  tpl: string;
  /** PC ids in the line. */
  between: string[];
  /** The NPC or employer, when one side is not a PC. */
  outsider?: string;
}

export interface CampaignCheck {
  ok: boolean;
  /** Character id -> number of friction lines they are in. */
  load: Record<string, number>;
  problems: Array<{ tone: "warning" | "danger"; text: string }>;
  /** The lines that passed, for the report. */
  lines: number;
}

const banned = (s: CampaignStance | undefined) => s !== undefined && (BANNED_STANCES as readonly string[]).includes(s);

/** Check a deal: material, stances, secrets, tension, coverage, spread and text. */
export function checkCampaignDeal(members: CheckedMember[], lines: CheckedLine[]): CampaignCheck {
  const problems: CampaignCheck["problems"] = [];
  const danger = (text: string) => problems.push({ tone: "danger", text });
  const n = members.length;
  const load: Record<string, number> = Object.fromEntries(members.map((m) => [m.id, 0]));
  const withPc: Record<string, number> = Object.fromEntries(members.map((m) => [m.id, 0]));

  for (const m of members) {
    const g = goalById(m.goal);
    if (!g) {
      danger(`${m.name}: "${m.goal}" is not a campaign goal`);
      continue;
    }
    if ((ARC_IDS as readonly string[]).includes(m.goal)) danger(`${m.name}: a cinematic arc dealt in campaign play`);
    if (g.betrayal > CAMPAIGN_BETRAYAL_MAX) danger(`${m.name}: goal "${g.name}" is betrayal level ${g.betrayal}`);
    if (banned(g.stance)) danger(`${m.name}: goal "${g.name}" takes the stance "${g.stance}"`);
    const beat = g.beats[m.beat];
    if (!beat) danger(`${m.name}: no beat ${m.beat + 1} in "${g.name}"`);
    else {
      if (beat.betrayal > CAMPAIGN_BETRAYAL_MAX) danger(`${m.name}: beat is betrayal level ${beat.betrayal}`);
      if (banned(beat.stance)) danger(`${m.name}: beat takes the stance "${beat.stance}"`);
      if (m.beatNamesPc && (!beat.stance || banned(beat.stance))) danger(`${m.name}: beat names a crewmate without a friendly stance`);
    }
    const s = secretById(m.secret);
    if (!s) danger(`${m.name}: unknown secret "${m.secret}"`);
    else {
      if (s.endangers !== false) danger(`${m.name}: secret "${s.id}" endangers someone`);
      if (s.betrayal > CAMPAIGN_BETRAYAL_MAX) danger(`${m.name}: secret is betrayal level ${s.betrayal}`);
    }
    if (!Number.isInteger(m.tension) || m.tension < 0 || m.tension > TENSION_CAP) danger(`${m.name}: tension ${m.tension} is outside the ladder (0-${TENSION_CAP})`);
    else if (TENSION_LADDER[m.tension]!.betrayal > CAMPAIGN_BETRAYAL_MAX) danger(`${m.name}: tension step is betrayal level ${TENSION_LADDER[m.tension]!.betrayal}`);
    for (const t of m.texts) {
      const hits = scanText(t);
      if (hits.length) danger(`${m.name}: banned words (${hits.join(", ")}) in "${t}"`);
    }
  }

  for (const l of lines) {
    const t = frictionTemplateById(l.tpl);
    if (!t) {
      danger(`friction line ${l.key}: unknown template "${l.tpl}"`);
      continue;
    }
    if (t.betrayal > CAMPAIGN_BETRAYAL_MAX) danger(`friction line ${l.key}: betrayal level ${t.betrayal}`);
    if (banned(t.stance)) danger(`friction line ${l.key}: takes the stance "${t.stance}"`);
    const pcs = l.between.filter((id) => id in load);
    if (pcs.length === 0) danger(`friction line ${l.key}: involves no PC`);
    for (const id of pcs) load[id]! += 1;
    if (pcs.length >= 2) for (const id of pcs) withPc[id]! += 1;
  }

  // coverage: everyone clashes with someone
  for (const m of members) {
    if (n >= 2 && withPc[m.id] === 0) problems.push({ tone: "warning", text: `${m.name} has no friction line with another PC` });
    if (n === 1 && load[m.id] === 0) problems.push({ tone: "warning", text: `${m.name} has no friction line with anyone` });
  }
  // spread: nobody is the target of everything
  if (n >= 3 && lines.length >= 3) {
    const fair = Math.ceil((2 * lines.length) / n);
    for (const m of members) {
      if (load[m.id] === lines.length) problems.push({ tone: "warning", text: `${m.name} is in every friction line` });
      else if (load[m.id]! > fair + 2) problems.push({ tone: "warning", text: `${m.name} is in ${load[m.id]} friction lines (fair share ${fair})` });
    }
  }
  return { ok: problems.length === 0, load, problems, lines: lines.length };
}
