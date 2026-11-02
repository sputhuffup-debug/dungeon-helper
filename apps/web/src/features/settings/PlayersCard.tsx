/**
 * Settings, Players: the people at the table. v1 has no player accounts; a
 * player here is a name, a contact note for the GM and the PCs they play, so
 * material can be shared with one player and sent to them as their own
 * packet (Share, Player packets).
 */
import { addPlayer, ownerMemberOf, playerMembers, removePlayer, setCharacterOwner, updatePlayer, type CampaignMember, type Entity } from "@campaign-forge/core";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, Card, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useMapVersion, useMeta } from "../../state/hooks";
import { playerCharacters } from "../generate/prefill";

export function PlayersCard() {
  const ctx = useCampaign();
  const meta = useMeta();
  const entitiesVersion = useMapVersion("entities");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pcs = useMemo(() => playerCharacters(ctx.store, ctx.module), [ctx.store, ctx.module, entitiesVersion]);
  const players = playerMembers(meta);
  const gms = meta.members.filter((m) => m.role === "gm");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [removing, setRemoving] = useState<CampaignMember | undefined>();

  const add = () => {
    try {
      addPlayer(ctx.store, { name, contact });
      setName("");
      setContact("");
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };

  return (
    <Card title="Players" subtitle="Who plays which PC. Share a handout with one player, then send each player their own packet from Share. Players have no accounts in this version." data-testid="players-card">
      <ul className="app-list app-players">
        {gms.map((m) => (
          <li key={m.id} className="app-list__row">
            <input
              className="cf-input cf-input--inline"
              aria-label="GM name"
              defaultValue={m.name}
              key={m.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== m.name) updatePlayer(ctx.store, m.id, { name: v });
              }}
            />
            <Badge tone="accent">GM</Badge>
          </li>
        ))}
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} pcs={pcs} meta={meta} onRemove={() => setRemoving(p)} />
        ))}
      </ul>
      {players.length === 0 && <p className="cf-muted">No players yet. Add the people at your table to share material with one of them.</p>}
      <form
        className="app-row app-players__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="cf-input" placeholder="Player name" aria-label="New player name" value={name} onChange={(e) => setName(e.target.value)} data-testid="player-new-name" />
        <input className="cf-input" placeholder="Contact (optional), e.g. @sam in the group chat" aria-label="New player contact" value={contact} onChange={(e) => setContact(e.target.value)} data-testid="player-new-contact" />
        <Button type="submit" variant="primary" disabled={!name.trim()} data-testid="player-add">
          Add player
        </Button>
      </form>
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? "player"}?`}
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => {
          if (removing) removePlayer(ctx.store, removing.id);
          setRemoving(undefined);
        }}
      >
        <p>Their characters stay, with no player. Anything shared only with them goes back to nobody, never to the whole group.</p>
      </ConfirmDialog>
    </Card>
  );
}

function PlayerRow({ player, pcs, meta, onRemove }: { player: CampaignMember; pcs: Entity[]; meta: ReturnType<typeof useMeta>; onRemove: () => void }) {
  const ctx = useCampaign();
  return (
    <li className="app-list__row app-players__row" data-testid="player-row" aria-label={`Player ${player.name}`}>
      <div className="app-players__who">
        <input
          className="cf-input cf-input--inline"
          aria-label={`${player.name}: name`}
          defaultValue={player.name}
          key={`n-${player.name}`}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== player.name) updatePlayer(ctx.store, player.id, { name: v });
          }}
        />
        <input
          className="cf-input cf-input--inline"
          aria-label={`${player.name}: contact`}
          placeholder="Contact note"
          defaultValue={player.contact ?? ""}
          key={`c-${player.contact ?? ""}`}
          onBlur={(e) => {
            if (e.target.value.trim() !== (player.contact ?? "")) updatePlayer(ctx.store, player.id, { contact: e.target.value });
          }}
        />
      </div>
      <div className="app-players__pcs" role="group" aria-label={`Characters ${player.name} plays`}>
        {pcs.length === 0 && <span className="cf-muted">No player characters yet</span>}
        {pcs.map((pc) => {
          const owner = ownerMemberOf(meta, pc);
          const mine = owner?.id === player.id;
          return (
            <label key={pc.id} className="app-chip-toggle" title={owner && !mine ? `Played by ${owner.name}; ticking moves it to ${player.name}` : undefined}>
              <input type="checkbox" checked={mine} onChange={(e) => setCharacterOwner(ctx.store, pc.id, e.target.checked ? player.id : undefined)} aria-label={`${player.name} plays ${pc.name}`} />
              {pc.name}
              {owner && !mine && <span className="cf-muted"> ({owner.name})</span>}
            </label>
          );
        })}
      </div>
      <Badge tone="success">Player</Badge>
      <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${player.name}`}>
        Remove
      </Button>
    </li>
  );
}
