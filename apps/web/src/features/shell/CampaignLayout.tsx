import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { RecordLinksContext, type RecordLinks } from "../../components/EntityLinkContext";
import { ErrorPage } from "../../components/ErrorPage";
import { Loading } from "../../components/Loading";
import { Badge, IconButton, useTheme } from "../../components/ui";
import { CampaignProvider } from "../../state/CampaignProvider";
import { useCampaign, useMeta, useOfflineStatus } from "../../state/hooks";
import { GlobalSearch } from "./GlobalSearch";

export function CampaignLayout() {
  const { campaignId } = useParams({ from: "/c/$campaignId" });
  return (
    <CampaignProvider
      campaignId={campaignId}
      loading={<Loading label="Opening campaign…" />}
      renderError={(error, retry) => <ErrorPage error={error} retry={retry} />}
    >
      <Shell />
    </CampaignProvider>
  );
}

const NAV: Array<{ to: string; label: string; icon: ReactNode }> = [
  { to: "/c/$campaignId/home", label: "Home", icon: <path d="M3 11l9-7 9 7v9h-6v-6H9v6H3Z" /> },
  { to: "/c/$campaignId/atlas", label: "Atlas", icon: <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Zm6-2v14m6-12v14" /> },
  { to: "/c/$campaignId/adventures", label: "Adventures", icon: <path d="M5 3h11l3 3v15H5Zm4 6h7M9 13h7M9 17h4" /> },
  { to: "/c/$campaignId/sessions", label: "Sessions", icon: <path d="M4 5h16v15H4Zm0 5h16M8 3v4m8-4v4" /> },
  { to: "/c/$campaignId/generate", label: "Generate", icon: <path d="M4 4h16v16H4Zm4.5 4.5h.01m7 0h.01M12 12h.01m-3.5 3.5h.01m7 0h.01" /> },
  { to: "/c/$campaignId/rules", label: "Rules", icon: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0v16" /> },
  { to: "/c/$campaignId/settings", label: "Settings", icon: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3 2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1Z" /> },
];

function Shell() {
  const ctx = useCampaign();
  const meta = useMeta();
  const { offline } = useOfflineStatus();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const modeName = ctx.module.manifest.modes.find((m) => m.id === meta.mode)?.name ?? meta.mode;

  const links = useMemo<RecordLinks>(
    () => ({
      openEntity: (entityId, tab) => void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId, entityId }, search: tab ? { tab } : {} }),
      openNote: (noteId) => void navigate({ to: "/c/$campaignId/notes/$noteId", params: { campaignId, noteId } }),
      openAdventure: (adventureId) => void navigate({ to: "/c/$campaignId/adventures/$adventureId", params: { campaignId, adventureId } }),
      openSession: (sessionId) => void navigate({ to: "/c/$campaignId/sessions/$sessionId", params: { campaignId, sessionId } }),
    }),
    [navigate, campaignId],
  );

  return (
    <RecordLinksContext.Provider value={links}>
      <div className="app-shell">
        <header className="app-header">
          <Link to="/" className="app-brand" title="All campaigns">
            <span className="app-brand__mark" aria-hidden="true">
              CF
            </span>
          </Link>
          <div className="app-header__title">
            <span className="app-header__name" data-testid="campaign-name">
              {meta.name}
            </span>
            <Badge tone="accent" title={`Play mode: ${modeName}`} data-testid="mode-badge">
              {modeName}
            </Badge>
          </div>
          <GlobalSearch />
          <div className="app-header__status">
            {offline ? (
              <Badge tone="warning" title="No network. Everything keeps working and is saved on this device." data-testid="offline-badge">
                Offline
              </Badge>
            ) : (
              <span className="app-status-dot" title="Saved on this device" aria-label="Online, saved on this device" />
            )}
            <IconButton variant="ghost" label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"} icon={resolved === "dark" ? "☀" : "☾"} onClick={toggle} />
          </div>
        </header>
        <nav className="app-nav" aria-label="Campaign">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ campaignId }}
              className="app-nav__link"
              activeProps={{ className: "app-nav__link is-active", "aria-current": "page" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <main className="app-main" id="main">
          <Outlet />
        </main>
      </div>
    </RecordLinksContext.Provider>
  );
}
