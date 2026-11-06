/**
 * "Give to its player": a handout written for one character (an agenda card)
 * goes into that character's player's packet once the GM gives it out. A
 * module may mark a handout kind as always going to its player; then this
 * only says so; a kind's `gmOnlyPurposes` keep a handout with the GM, with the
 * module's note in place of the toggle.
 *
 * Giving is the handout's visibility, one state with the Visibility row:
 * ticking it adds the player to the handout's "Some players" (from GM only,
 * or beside the players it already names), unticking takes them off it (back
 * to GM only when nobody is left). A handout every player sees shows it as
 * given. An older handout given with `toOwner` reads as given too, and a
 * change moves it onto the visibility.
 */
import { canSee, handoutStaysWithGm, ownerMemberOf, SHARE_VIEWER, type CampaignMember, type Handout, type Visibility } from "@campaign-forge/core";
import { useCampaign, useMeta, useRecord } from "../state/hooks";
import { updateHandout } from "../state/prepActions";
import { Badge } from "./ui";

/** Is the handout in this player's hands: its visibility names them (or everyone), or it was given the older way (`toOwner`). */
export function givenTo(handout: Pick<Handout, "visibility" | "toOwner">, owner: Pick<CampaignMember, "id"> | undefined): boolean {
  if (handout.toOwner === true || canSee(handout.visibility, SHARE_VIEWER)) return true;
  return !!owner && handout.visibility.level === "some_players" && (handout.visibility.players ?? []).includes(owner.id);
}

/** The handout's visibility once given to (or taken back from) the player: their name added to, or removed from, "Some players". */
export function giveVisibility(visibility: Visibility, ownerId: string, give: boolean): Visibility {
  const named = visibility.level === "some_players" ? (visibility.players ?? []) : [];
  if (give) return { level: "some_players", players: [...new Set([...named, ownerId])] };
  const left = named.filter((id) => id !== ownerId);
  return left.length ? { level: "some_players", players: left } : { level: "gm" };
}

export function GiveToPlayer({ handout }: { handout: Handout }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const character = useRecord("entities", handout.character);
  if (!handout.character) return null;
  // a handout the module keeps with the GM (e.g. the GM's own agenda card) is never given out
  const staysWithGm = handoutStaysWithGm(handout, ctx.module.module);
  if (staysWithGm)
    return (
      <span className="cf-muted app-give-note" data-testid="give-to-player-gm-only">
        {staysWithGm}
      </span>
    );
  const owner = character ? ownerMemberOf(meta, character) : undefined;
  const always = ctx.module.module.ownerHandouts?.some((r) => r.kind === handout.kind && r.when === "always");
  if (always) return <Badge tone="accent">{owner ? `Goes to ${owner.name}` : "Goes to its player"}</Badge>;
  const everyone = canSee(handout.visibility, SHARE_VIEWER);
  const given = givenTo(handout, owner);
  const title = everyone
    ? "Every player sees this handout: change its visibility to give it to one player."
    : owner
      ? `${owner.name} plays ${character?.name ?? "this character"}: giving it adds them to the handout's visibility, and their player packet gets it.`
      : "Pick who plays the character (Settings, Players) to give this to them.";
  return (
    <label className="app-toggle" title={title}>
      <input
        type="checkbox"
        className="cf-checkbox"
        checked={given}
        disabled={everyone || (!owner && !given)}
        onChange={(e) => {
          const give = e.target.checked;
          // one state: the visibility (an older `toOwner` mark goes with the change)
          const visibility = owner ? giveVisibility(handout.visibility, owner.id, give) : handout.visibility;
          updateHandout(ctx, handout.id, { visibility, toOwner: undefined });
        }}
        data-testid="give-to-player"
        aria-label={`Give ${handout.title} to ${owner?.name ?? "its player"}`}
      />
      {everyone ? "Every player sees it" : owner ? `Give to ${owner.name}` : "Give to its player"}
    </label>
  );
}
