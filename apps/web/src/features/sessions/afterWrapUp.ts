/**
 * Where the GM lands after "Finish session": the module's between-jobs
 * procedure with the closed record picked (a job just finished), else the
 * next session's page (its plan and its "Previously on…"). Kept apart from
 * the wrap-up so the pages that open it stay light.
 */
import type { Id } from "@campaign-forge/core";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export type WrapUpLanding = { kind: "procedure"; procedureId: string; pick?: string } | { kind: "session"; sessionId: Id } | { kind: "home" };

export function useLandAfterWrapUp(campaignId: string): (landing: WrapUpLanding) => void {
  const navigate = useNavigate();
  return useCallback(
    (landing: WrapUpLanding) => {
      if (landing.kind === "procedure") void navigate({ to: "/c/$campaignId/generate/$procedureId", params: { campaignId, procedureId: landing.procedureId }, search: landing.pick ? { pick: landing.pick } : {} });
      else if (landing.kind === "session") void navigate({ to: "/c/$campaignId/sessions/$sessionId", params: { campaignId, sessionId: landing.sessionId } });
      else void navigate({ to: "/c/$campaignId/home", params: { campaignId } });
    },
    [navigate, campaignId],
  );
}
