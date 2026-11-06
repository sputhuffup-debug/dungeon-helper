/**
 * Ways into the character builder: *Build a character* (the Atlas PCs tab,
 * the new-entity page), the unfinished drafts to resume, and *Level up* on a
 * character's sheet. They show only for modules that declare a builder.
 * Procedures that make a character (`Procedure.createsCharacter`, e.g. a life
 * path) are offered the same way, beside "+ Character".
 */
import type { Entity } from "@campaign-forge/core";
import { canLevelUp, type CharacterBuilderDef, type Procedure } from "@campaign-forge/module-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Button } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { newId } from "@campaign-forge/core";
import { discardDraft, draftFor, draftLabel, readDrafts, resolveDraft } from "./drafts";
import "./builder.css";

/** The module's builder for an entity type (the first character builder when no type is given). */
export function useCharacterBuilder(entityType?: string): CharacterBuilderDef | undefined {
  const ctx = useCampaign();
  return useMemo(() => ctx.module.characterBuildersFor(entityType)[0], [ctx.module, entityType]);
}

/**
 * The module's procedures that make a character in the campaign's play mode:
 * of `entityType` when given, player-character ones only with `pc`.
 */
export function useCharacterProcedures(opts: { entityType?: string; pc?: boolean } = {}): Procedure[] {
  const ctx = useCampaign();
  const meta = useMeta();
  const { entityType, pc } = opts;
  return useMemo(
    () =>
      ctx.module
        .forMode(meta.mode)
        .procedures.filter((p) => p.createsCharacter && (!entityType || p.createsCharacter.entityType === entityType) && (pc === undefined || (p.createsCharacter.pc === true) === pc)),
    [ctx.module, meta.mode, entityType, pc],
  );
}

/** A button per character-making procedure (e.g. *Roll a Life Path*), opening it in Generate. */
export function CharacterProcedureLinks({ entityType, pc, primary = false }: { entityType?: string; pc?: boolean; primary?: boolean }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const procedures = useCharacterProcedures({ entityType, pc });
  return (
    <>
      {procedures.map((p) => (
        <Button
          key={p.id}
          variant={primary ? "primary" : "default"}
          onClick={() => void navigate({ to: "/c/$campaignId/generate/$procedureId", params: { campaignId: ctx.campaignId, procedureId: p.id } })}
          data-testid="character-procedure"
          data-procedure={p.id}
        >
          {p.createsCharacter!.label}
        </Button>
      ))}
    </>
  );
}

export function BuildCharacterButton({ entityType, variant = "primary", label = "Build a character" }: { entityType?: string; variant?: "primary" | "default"; label?: string }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const builder = useCharacterBuilder(entityType);
  if (!builder) return null;
  return (
    <Button
      variant={variant}
      onClick={() => {
        // the draft is saved on its first change: opening the builder and leaving leaves nothing behind
        void navigate({ to: "/c/$campaignId/build", params: { campaignId: ctx.campaignId }, search: { draft: newId(), builder: builder.id } });
      }}
      data-testid="build-character"
    >
      {label}
    </Button>
  );
}

/** Characters started in the builder and not finished yet. */
export function DraftList() {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const drafts = useMemo(
    () =>
      readDrafts(meta.settings)
        .filter((d) => d.mode === "create" && ctx.module.characterBuilder(d.builder))
        .map((d) => {
          let label = draftLabel(d);
          try {
            label = draftLabel(d, resolveDraft(ctx.module.module, ctx.module.characterBuilder(d.builder)!, d, undefined));
          } catch {
            // the bare label will do
          }
          return { draft: d, label };
        }),
    [meta.settings, ctx.module],
  );
  if (drafts.length === 0) return null;
  return (
    <div className="cb-drafts" data-testid="character-drafts">
      <h3 className="cb-drafts__title">Unfinished characters</h3>
      <ul>
        {drafts.map(({ draft: d, label }) => (
          <li key={d.id} className="cb-drafts__row" data-testid={`draft-${d.id}`}>
            <span className="cb-drafts__name">{label}</span>
            <span className="cf-muted">started {new Date(d.created).toLocaleDateString()}</span>
            <Button size="sm" onClick={() => void navigate({ to: "/c/$campaignId/build", params: { campaignId: ctx.campaignId }, search: { draft: d.id } })} data-testid="draft-resume">
              Resume
            </Button>
            <Button size="sm" variant="ghost" onClick={() => discardDraft(ctx, d.id)}>
              Discard
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** *Level up* (or *Resume level up*) on a character the module's builder can level. */
export function LevelUpButton({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const builder = useCharacterBuilder(entity.type);
  if (!builder?.levelUp || entity.fields.isPC === false) return null;
  const open = draftFor(meta.settings, entity.id);
  const able = canLevelUp(ctx.module.module, builder, entity.fields);
  if (!able && !open) return null;
  return (
    <Button
      onClick={() => {
        void navigate({ to: "/c/$campaignId/build", params: { campaignId: ctx.campaignId }, search: open ? { draft: open.id } : { draft: newId(), builder: builder.id, entity: entity.id } });
      }}
      data-testid="level-up"
    >
      {open ? "Resume level up" : "Level up"}
    </Button>
  );
}
