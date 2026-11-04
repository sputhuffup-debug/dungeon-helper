/**
 * The shared sheet renderer with the campaign's rule card titles: a field's
 * "?" button reads "Rule: Careers", never the card's id. Outside a campaign
 * it is the plain renderer.
 */
import { SheetRenderer as BaseSheetRenderer, type SheetRendererProps } from "@campaign-forge/ui";
import { useMemo } from "react";
import { useOptionalCampaign } from "../state/CampaignProvider";

export function SheetRenderer(props: SheetRendererProps) {
  const rules = useOptionalCampaign()?.module.module.rules;
  const ruleTitle = useMemo(() => {
    const titles = new Map((rules ?? []).map((r) => [r.id, r.title]));
    return (id: string) => titles.get(id);
  }, [rules]);
  return <BaseSheetRenderer ruleTitle={ruleTitle} {...props} />;
}
