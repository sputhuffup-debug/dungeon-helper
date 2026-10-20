/**
 * Story points at the table and on the sheet: the pool as pips, "−" to spend
 * one with a reason (the module's uses, or the GM's own words) and "+" to
 * award one (the end-of-act award when the act is known). Every change is
 * logged in the advancement log with the session.
 */
import type { Entity, Id } from "@campaign-forge/core";
import { useState } from "react";
import { Button, Pips, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { poolValue } from "@campaign-forge/module-sdk";
import { useCampaign, useMeta } from "../../state/hooks";
import "./progression.css";
import { actAwardOf, awardQuestionsOf, awardStoryPoint, poolOf, postActAward, spendStoryPoint, storyUses, type SessionAct } from "../../state/progressionActions";

const OTHER = "__other";
/** "Story Points" -> "Story Point", for "spend a ..." labels. */
const one = (label: string) => label.replace(/s$/, "");

/** "Spend" with a reason picker; used on the Progression tab and on PC cards. */
export function StoryPointSpend({ entity, sessionId, compact }: { entity: Entity; sessionId?: Id; compact?: boolean }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const pool = poolOf(ctx.module, mode, "story");
  const uses = storyUses(ctx);
  const [open, setOpen] = useState(false);
  const [use, setUse] = useState(uses[0]?.id ?? OTHER);
  const [reason, setReason] = useState("");
  if (!pool) return null;
  const have = poolValue(pool, entity.fields);
  const spend = () => {
    try {
      const picked = uses.find((u) => u.id === use);
      spendStoryPoint(ctx, { character: entity.id, ...(picked ? { use: picked.id } : {}), reason: reason.trim() || picked?.label || "Spent", ...(sessionId ? { sessionId } : {}) });
      pushToast(`${entity.name} spends a ${one(pool.label)}: ${reason.trim() || picked?.label || "spent"}.`, { tone: "success" });
      setOpen(false);
      setReason("");
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} disabled={have <= 0} aria-label={`Spend a ${one(pool.label)} for ${entity.name}`} title={compact ? `Spend a ${one(pool.label)}` : undefined}>
        {compact ? "−" : `Spend ${one(pool.label)}`}
      </Button>
    );
  }
  return (
    <span className="prog-spend-sp" role="group" aria-label={`Spend a ${one(pool.label)} for ${entity.name}`}>
      <select className="cf-select" aria-label="Reason" value={use} onChange={(e) => setUse(e.target.value)}>
        {uses.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      <input className="cf-input" aria-label="Note" placeholder={use === OTHER ? "Why?" : "Note (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" variant="primary" onClick={spend} disabled={use === OTHER && !reason.trim()}>
        Spend
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** Pips plus − and + for a PC card in table mode. */
export function StoryPointCard({ entity, sessionId, act }: { entity: Entity; sessionId: Id; act?: SessionAct }) {
  const ctx = useCampaign();
  const { mode } = useMeta();
  const pool = poolOf(ctx.module, mode, "story");
  if (!pool) return null;
  const have = poolValue(pool, entity.fields);
  const max = pool.max ?? 3;
  const actQuestion = awardQuestionsOf(ctx, "act").find((q) => (q.pool ?? "experience") === "story");
  const awarded = act && actQuestion ? !!actAwardOf(ctx, act, entity.id, actQuestion.id) : false;
  const award = () => {
    try {
      if (act && actQuestion) postActAward(ctx, { character: entity.id, act, question: actQuestion.id, sessionId, source: { kind: "table" } });
      else awardStoryPoint(ctx, { character: entity.id, reason: "Awarded at the table", sessionId });
      pushToast(`${entity.name}: +1 ${one(pool.label)}${act ? ` for act ${act.number}` : ""}.`, { tone: "success" });
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  return (
    <span className="prog-sp-card" data-testid="story-points" data-value={have}>
      <span className="app-stat__label">{pool.label}</span>
      <Pips value={have} max={max} label={`${entity.name} ${pool.label}`} readonly showValue={false} />
      <StoryPointSpend entity={entity} sessionId={sessionId} compact />
      <Button
        size="sm"
        onClick={award}
        disabled={have >= max || awarded}
        aria-label={`Award a ${one(pool.label)} to ${entity.name}${act ? ` for act ${act.number}` : ""}`}
        title={awarded ? `Already awarded for act ${act?.number}` : act && actQuestion ? actQuestion.text : `Award a ${one(pool.label)}`}
      >
        +
      </Button>
    </span>
  );
}
