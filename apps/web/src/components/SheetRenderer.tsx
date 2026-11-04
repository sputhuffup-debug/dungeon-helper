/**
 * The shared sheet renderer with the campaign's rule card titles: a field's
 * "?" button reads "Rule: Careers", never the card's id. Outside a campaign
 * it is the plain renderer. Imported by path, not through the ui barrel, so
 * a page without a sheet (the campaign list) never loads the sheet code.
 */
import { SheetRenderer as BaseSheetRenderer, type SheetRendererProps } from "@campaign-forge/ui";
import { useContext, useMemo } from "react";
// the context alone: importing the provider would pull the store and the SDK into every page
import { CampaignContext } from "../state/campaignContext";

export function SheetRenderer(props: SheetRendererProps) {
  const rules = useContext(CampaignContext)?.module.module.rules;
  const ruleTitle = useMemo(() => {
    const titles = new Map((rules ?? []).map((r) => [r.id, r.title]));
    return (id: string) => titles.get(id);
  }, [rules]);
  return <BaseSheetRenderer ruleTitle={ruleTitle} {...props} />;
}
