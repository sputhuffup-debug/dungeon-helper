/**
 * Code-based route tree. Every page is a lazy chunk.
 *
 * Feature folders added later (adventure builder, generator workbench,
 * table mode, session wrap-up, map page) replace the PLACEHOLDER routes
 * below by pointing their `component` at their own page.
 */
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { RootLayout } from "./features/shell/RootLayout";

const rootRoute = createRootRoute({ component: RootLayout });

const campaignsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./features/campaigns/CampaignListPage"), "CampaignListPage"),
});

export const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/c/$campaignId",
  component: lazyRouteComponent(() => import("./features/shell/CampaignLayout"), "CampaignLayout"),
});

const campaignIndexRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/c/$campaignId/home", params: { campaignId: params.campaignId } });
  },
});

const homeRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "home",
  component: lazyRouteComponent(() => import("./features/home/HomePage"), "HomePage"),
});

export interface AtlasSearch {
  tab?: string;
}

const atlasRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "atlas",
  validateSearch: (search: Record<string, unknown>): AtlasSearch => (typeof search.tab === "string" ? { tab: search.tab } : {}),
  component: lazyRouteComponent(() => import("./features/atlas/AtlasPage"), "AtlasPage"),
});

export interface NewEntitySearch {
  type?: string;
  preset?: string;
  subtype?: string;
  name?: string;
  /** 1: a player character (the Atlas's PCs tab), for types whose schema has `isPC`. */
  pc?: 1;
}

const newEntityRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "entities/new",
  validateSearch: (search: Record<string, unknown>): NewEntitySearch => {
    const out: NewEntitySearch = {};
    for (const k of ["type", "preset", "subtype", "name"] as const) if (typeof search[k] === "string") out[k] = search[k] as string;
    if (search.pc === 1 || search.pc === "1" || search.pc === true) out.pc = 1;
    return out;
  },
  component: lazyRouteComponent(() => import("./features/entities/NewEntityPage"), "NewEntityPage"),
});

export interface BuildSearch {
  draft?: string;
  step?: string;
}

const buildRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "build",
  validateSearch: (search: Record<string, unknown>): BuildSearch => {
    const out: BuildSearch = {};
    for (const k of ["draft", "step"] as const) if (typeof search[k] === "string" && search[k] !== "") out[k] = search[k] as string;
    return out;
  },
  component: lazyRouteComponent(() => import("./features/builder/CharacterBuilderPage"), "CharacterBuilderPage"),
});

export interface EntitySearch {
  tab?: string;
}

const entityRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "entities/$entityId",
  validateSearch: (search: Record<string, unknown>): EntitySearch => (typeof search.tab === "string" ? { tab: search.tab } : {}),
  component: lazyRouteComponent(() => import("./features/entities/EntityPage"), "EntityPage"),
});

const noteRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "notes/$noteId",
  component: lazyRouteComponent(() => import("./features/notes/NotePage"), "NotePage"),
});

export interface RulesSearch {
  rule?: string;
}

const rulesRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "rules",
  validateSearch: (search: Record<string, unknown>): RulesSearch => (typeof search.rule === "string" ? { rule: search.rule } : {}),
  component: lazyRouteComponent(() => import("./features/rules/RulesPage"), "RulesPage"),
});

const referenceRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "reference",
  component: lazyRouteComponent(() => import("./features/reference/ReferencePage"), "ReferencePage"),
});

const gmScreenRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "gm-screen",
  component: lazyRouteComponent(() => import("./features/gmscreen/GmScreenPage"), "GmScreenPage"),
});

const settingsRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "settings",
  component: lazyRouteComponent(() => import("./features/settings/SettingsPage"), "SettingsPage"),
});

// ---------------------------------------------------------------------------
// PLACEHOLDER routes: the next build step replaces these components.
// ---------------------------------------------------------------------------
const placeholder = (name: "Adventures" | "Adventure" | "Generate" | "Procedure" | "TableMode" | "Sessions" | "Session" | "Map") =>
  lazyRouteComponent(() => import("./features/placeholders/Placeholders"), name);

const adventuresRoute = createRoute({ getParentRoute: () => campaignRoute, path: "adventures", validateSearch: (s: Record<string, unknown>): { status?: string } => (typeof s.status === "string" ? { status: s.status } : {}), component: lazyRouteComponent(() => import("./features/adventures/AdventuresPage"), "AdventuresPage") });
const adventureRoute = createRoute({ getParentRoute: () => campaignRoute, path: "adventures/$adventureId", validateSearch: (s: Record<string, unknown>): { node?: string; view?: string; step?: string } => ({ ...(typeof s.node === "string" ? { node: s.node } : {}), ...(typeof s.view === "string" ? { view: s.view } : {}), ...(typeof s.step === "string" ? { step: s.step } : {}) }), component: lazyRouteComponent(() => import("./features/adventures/AdventurePage"), "AdventurePage") });
const generateRoute = createRoute({ getParentRoute: () => campaignRoute, path: "generate", component: lazyRouteComponent(() => import("./features/generate/GeneratePage"), "GeneratePage") });
const procedureRoute = createRoute({ getParentRoute: () => campaignRoute, path: "generate/$procedureId", validateSearch: (s: Record<string, unknown>): { run?: string; chainFrom?: string; chain?: number; within?: string; pick?: string } => ({ ...(typeof s.run === "string" ? { run: s.run } : {}), ...(typeof s.pick === "string" && s.pick !== "" ? { pick: s.pick } : {}), ...(typeof s.chainFrom === "string" ? { chainFrom: s.chainFrom } : {}), ...(typeof s.chain === "number" || (typeof s.chain === "string" && s.chain !== "") ? { chain: Number(s.chain) } : {}), ...(typeof s.within === "string" ? { within: s.within } : {}) }), component: lazyRouteComponent(() => import("./features/generate/ProcedurePage"), "ProcedurePage") });
const tableRoute = createRoute({ getParentRoute: () => campaignRoute, path: "table/$sessionId", validateSearch: (s: Record<string, unknown>): { view?: string } => (typeof s.view === "string" ? { view: s.view } : {}), component: lazyRouteComponent(() => import("./features/table/TableModePage"), "TableModePage") });
const shipRoute = createRoute({ getParentRoute: () => campaignRoute, path: "ship", component: lazyRouteComponent(() => import("./features/ship/ShipPage"), "ShipPage") });
const sessionsRoute = createRoute({ getParentRoute: () => campaignRoute, path: "sessions", component: lazyRouteComponent(() => import("./features/sessions/SessionsPage"), "SessionsPage") });
const sessionRoute = createRoute({ getParentRoute: () => campaignRoute, path: "sessions/$sessionId", component: lazyRouteComponent(() => import("./features/sessions/SessionPage"), "SessionPage") });
const primerRoute = createRoute({ getParentRoute: () => campaignRoute, path: "primer", component: lazyRouteComponent(() => import("./features/primer/PrimerPage"), "PrimerPage") });
const mapRoute = createRoute({ getParentRoute: () => campaignRoute, path: "maps/$mapId", component: lazyRouteComponent(() => import("./features/maps/MapPage"), "MapPage") });
// Site map workbench (features/mapgen): ?generator=&adventure=&map=
const mapGenRoute = createRoute({ getParentRoute: () => campaignRoute, path: "maps/new", validateSearch: (s: Record<string, unknown>): { generator?: string; adventure?: string; map?: string } => { const out: { generator?: string; adventure?: string; map?: string } = {}; for (const k of ["generator", "adventure", "map"] as const) if (typeof s[k] === "string" && s[k] !== "") out[k] = s[k] as string; return out; }, component: lazyRouteComponent(() => import("./features/mapgen/MapGenPage"), "MapGenPage") });

export const routeTree = rootRoute.addChildren([
  campaignsRoute,
  campaignRoute.addChildren([
    campaignIndexRoute,
    homeRoute,
    atlasRoute,
    newEntityRoute,
    buildRoute,
    entityRoute,
    noteRoute,
    rulesRoute,
    referenceRoute,
    gmScreenRoute,
    settingsRoute,
    adventuresRoute,
    adventureRoute,
    generateRoute,
    procedureRoute,
    tableRoute,
    sessionsRoute,
    sessionRoute,
    primerRoute,
    shipRoute,
    mapRoute,
    mapGenRoute,
  ]),
]);

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
