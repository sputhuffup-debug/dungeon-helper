/**
 * The open campaign's React context on its own, without the store, Yjs or
 * module loading behind it: light enough for the UI barrel (the campaign
 * list must not pull the SDK in through a sheet wrapper).
 */
import { createContext } from "react";
import type { CampaignContextValue } from "./CampaignProvider";

export const CampaignContext = createContext<CampaignContextValue | undefined>(undefined);
