/**
 * "Give to its player": a handout written for one character (an agenda card)
 * goes into that character's player's packet once the GM gives it out. A
 * module may mark a handout kind as always going to its player; then this
 * only says so.
 */
import { ownerMemberOf, type Handout } from "@campaign-forge/core";
import { useCampaign, useMeta, useRecord } from "../state/hooks";
import { updateHandout } from "../state/prepActions";
import { Badge } from "./ui";

export function GiveToPlayer({ handout }: { handout: Handout }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const character = useRecord("entities", handout.character);
  if (!handout.character) return null;
  const owner = character ? ownerMemberOf(meta, character) : undefined;
  const always = ctx.module.module.ownerHandouts?.some((r) => r.kind === handout.kind && r.when === "always");
  if (always) return <Badge tone="accent">{owner ? `Goes to ${owner.name}` : "Goes to its player"}</Badge>;
  return (
    <label className="app-toggle" title={owner ? `${owner.name} plays ${character?.name ?? "this character"}: their player packet gets this handout.` : "Pick who plays the character (Settings, Players) to give this to them."}>
      <input
        type="checkbox"
        className="cf-checkbox"
        checked={handout.toOwner === true}
        disabled={!owner && handout.toOwner !== true}
        onChange={(e) => updateHandout(ctx, handout.id, { toOwner: e.target.checked ? true : undefined })}
        data-testid="give-to-player"
        aria-label={`Give ${handout.title} to ${owner?.name ?? "its player"}`}
      />
      {owner ? `Give to ${owner.name}` : "Give to its player"}
    </label>
  );
}
