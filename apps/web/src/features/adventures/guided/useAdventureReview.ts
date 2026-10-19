/**
 * The builder's review, recomputed as the GM edits: any record change or
 * rich-text edit schedules a debounced rebuild of the review context (core)
 * and a run of the module's rules (sdk). Never blocks anything.
 */
import { adventureReviewContext, type Id } from "@campaign-forge/core";
import { runAdventureReview, type AdventureBuilderDef, type ReviewResult } from "@campaign-forge/module-sdk";
import { useEffect, useRef, useState } from "react";
import { useCampaign, useMapVersion } from "../../../state/hooks";

export const REVIEW_DEBOUNCE_MS = 300;

export function useAdventureReview(adventureId: Id, builder: AdventureBuilderDef): ReviewResult | undefined {
  const ctx = useCampaign();
  const records = useMapVersion("*");
  const docs = useMapVersion("docs");
  const [result, setResult] = useState<ReviewResult | undefined>(undefined);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      adventureReviewContext(ctx.store, ctx.registry, ctx.module, adventureId, { roles: builder.cast.map((r) => r.id), whenDocSynced: ctx.whenDocSynced })
        .then((context) => {
          if (!cancelled) setResult(runAdventureReview(builder, context));
        })
        .catch(() => undefined);
    };
    // The first review runs at once; later ones wait for a pause in typing.
    const timer = setTimeout(run, first.current ? 0 : REVIEW_DEBOUNCE_MS);
    first.current = false;
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ctx, adventureId, builder, records, docs]);

  return result;
}
