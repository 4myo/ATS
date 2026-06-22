import { NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Mic,
  Menu,
  Network,
  UserSearch,
  Settings,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

type SidebarProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
  role?: WorkspaceRole;
};

export type WorkspaceRole = "recruiter" | "hiring_manager" | "interviewer";

export function Sidebar({ collapsed = false, onNavigate, onToggle, role = "recruiter" }: SidebarProps) {
  const navigate = useNavigate();
  const { t, tt } = useI18n();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: tt("Pregled"), end: true, roles: ["recruiter", "hiring_manager", "interviewer"] },
    { to: '/applicants', icon: Users, label: tt("Kandidati"), roles: ["recruiter", "hiring_manager", "interviewer"] },
    { to: '/jobs', icon: Briefcase, label: tt("Delovna mesta"), roles: ["recruiter", "hiring_manager"] },
    { to: '/headhunter', icon: UserSearch, label: tt("Lov na talente"), roles: ["recruiter"] },
    { to: '/interviews', icon: Mic, label: tt("Razgovori"), end: true, roles: ["recruiter", "hiring_manager", "interviewer"] },
    {
      to: '/interviews/workflow',
      icon: Network,
      label: tt("Poteki razgovorov"),
      roles: ["recruiter", "hiring_manager", "interviewer"],
    },
    { to: '/offers', icon: FileText, label: tt("Ponudbe"), roles: ["recruiter", "hiring_manager"] },
    { to: '/settings', icon: Settings, label: t("settings"), roles: ["recruiter", "hiring_manager", "interviewer"] },
  ].filter((item) => item.roles.includes(role));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div
      className={clsx(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[4.5rem]" : "w-60",
      )}
    >
      <div
        className={clsx(
          "flex h-16 items-center border-b border-sidebar-border transition-[padding] duration-300 ease-in-out",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {!collapsed ? (
          <div className="flex min-w-0 items-center">
            <img
              src="/images/logo.png"
              alt="Smart ATS Logo"
              className="mr-3 h-10 w-10 shrink-0 object-contain"
            />
            <span className="truncate text-base font-semibold tracking-tight logo-font">
              Smart ATS
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={onToggle}
          aria-label={collapsed ? tt("Prikaži meni") : tt("Skrči meni")}
          title={collapsed ? tt("Prikaži meni") : tt("Skrči meni")}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <nav className={clsx("flex-1 space-y-1 py-4", collapsed ? "px-2" : "px-3")} aria-label={tt("Glavna navigacija")}>
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center rounded-md text-sm font-medium logo-font transition-all duration-200 ease-in-out',
                  collapsed ? "h-10 justify-center px-0" : "px-3 py-2.5",
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <Icon
                className={clsx(
                  "h-5 w-5 flex-shrink-0",
                  !collapsed && "mr-3",
                )}
                aria-hidden="true"
              />
              <span className={clsx("truncate", collapsed && "sr-only")}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className={clsx("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
        <button
          className={clsx(
            "group flex w-full items-center rounded-md text-sm font-medium text-sidebar-foreground/60 transition-all duration-200 ease-in-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground logo-font",
            collapsed ? "h-10 justify-center px-0" : "px-3 py-2.5",
          )}
          onClick={handleSignOut}
          aria-label={collapsed ? t("signOut") : undefined}
          title={collapsed ? t("signOut") : undefined}
        >
          <LogOut className={clsx("h-5 w-5", !collapsed && "mr-3")} />
          <span className={clsx("truncate", collapsed && "sr-only")}>
            {t("signOut")}
          </span>
        </button>
      </div>
    </div>
  );
}
