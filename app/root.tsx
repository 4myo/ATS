import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useEffect, type ReactNode } from "react";
import "../styles/index.css";
import { I18nProvider } from "./lib/i18n";
import { ConfirmProvider } from "./lib/confirm";
import { applyUserPreferences } from "./lib/userPreferences";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  useEffect(() => {
    applyUserPreferences();
  }, []);

  return (
    <I18nProvider>
      <ConfirmProvider>
        <Outlet />
      </ConfirmProvider>
    </I18nProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading Smart ATS...
    </div>
  );
}
