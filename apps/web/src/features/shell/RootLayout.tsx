import { Outlet } from "@tanstack/react-router";
import { ToastViewport, useTheme } from "../../components/ui";

export function RootLayout() {
  // applies the stored theme preference to <html>
  useTheme();
  return (
    <div className="cf-app app-root">
      <Outlet />
      <ToastViewport />
    </div>
  );
}
