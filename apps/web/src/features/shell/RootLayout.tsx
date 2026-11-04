import { Outlet, useRouterState } from "@tanstack/react-router";
import { EmptyState, ToastViewport, useTheme } from "../../components/ui";
import { playerWindowSession } from "../table/playerWindowName";

export function RootLayout() {
  // applies the stored theme preference to <html>
  useTheme();
  // a window opened as the player screen never shows a page outside its campaign (the campaign list, a module guide)
  const strayPlayerWindow = useRouterState({ select: (s) => !s.location.pathname.startsWith("/c/") && !!playerWindowSession(s.location.pathname, {}) });
  return (
    <div className="cf-app app-root">
      {strayPlayerWindow ? <EmptyState title="Player screen" text="This window is the player screen. Open it again from table mode." /> : <Outlet />}
      <ToastViewport />
    </div>
  );
}
