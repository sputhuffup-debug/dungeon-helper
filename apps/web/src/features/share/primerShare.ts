/** The campaign primer as share sections: one per section with text, in the primer's order. */
import { primerText, type Id } from "@campaign-forge/core";
import type { CampaignContextValue } from "../../state/CampaignProvider";
import { markdownBlocks, type ShareSection } from "./shareLayout";

type Ctx = Pick<CampaignContextValue, "store" | "registry" | "whenDocSynced">;

/** Load the primer's bodies and turn them into share sections (empty sections are left out). */
export async function primerShareSections(ctx: Ctx): Promise<ShareSection[]> {
  const primer = ctx.store.meta().primer;
  if (!primer) return [];
  await Promise.all(
    primer.sections.map((s) => {
      ctx.registry.open(s.doc);
      return ctx.whenDocSynced(s.doc).catch(() => undefined);
    }),
  );
  return primerText(primer, (id: Id) => ctx.registry.peek(id)).map((s) => ({
    id: `primer:${s.id}`,
    kind: "primer",
    eyebrow: "Campaign primer",
    title: s.title,
    blocks: markdownBlocks(s.markdown),
    file: `primer-${s.id}`,
  }));
}
