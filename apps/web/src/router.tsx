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
}

const newEntityRoute = createRoute({
  getParentRoute: () => campaignRoute,
  path: "entities/new",
  validateSearch: (search: Record<string, unknown>): NewEntitySearch => {
    const out: NewEntitySearch = {};
    for (const k of ["type", "preset", "subtype", "name"] as const) if (typeof search[k] === "string") out[k] = search[k] as string;
    return out;
  },
  component: lazyRouteComponent(() => import("./features/entities/NewEntityPage"), "NewEntityPage"),
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

const adventuresRoute = createRoute({ getParentRoute: () => campaignRoute, path: "adventures", component: placeholder("Adventures") });
const adventureRoute = createRoute({ getParentRoute: () => campaignRoute, path: "adventures/$adventureId", component: placeholder("Adventure") });
const generateRoute = createRoute({ getParentRoute: () => campaignRoute, path: "generate", component: placeholder("Generate") });
const procedureRoute = createRoute({ getParentRoute: () => campaignRoute, path: "generate/$procedureId", component: placeholder("Procedure") });
const tableRoute = createRoute({ getParentRoute: () => campaignRoute, path: "table/$sessionId", component: placeholder("TableMode") });
const sessionsRoute = createRoute({ getParentRoute: () => campaignRoute, path: "sessions", component: placeholder("Sessions") });
const sessionRoute = createRoute({ getParentRoute: () => campaignRoute, path: "sessions/$sessionId", component: placeholder("Session") });
const mapRoute = createRoute({ getParentRoute: () => campaignRoute, path: "maps/$mapId", component: placeholder("Map") });

export const routeTree = rootRoute.addChildren([
  campaignsRoute,
  campaignRoute.addChildren([
    campaignIndexRoute,
    homeRoute,
    atlasRoute,
    newEntityRoute,
    entityRoute,
    noteRoute,
    rulesRoute,
    referenceRoute,
    settingsRoute,
    adventuresRoute,
    adventureRoute,
    generateRoute,
    procedureRoute,
    tableRoute,
    sessionsRoute,
    sessionRoute,
    mapRoute,
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
