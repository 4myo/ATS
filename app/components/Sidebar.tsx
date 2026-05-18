import { NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Bot,
  FileText,
  GitBranch,
  Mic,
  Menu,
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
};

export function Sidebar({ collapsed = false, onNavigate, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const { t, tt } = useI18n();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t("dashboard"), end: true },
    { to: '/applicants', icon: Users, label: t("applicants") },
    { to: '/jobs', icon: Briefcase, label: t("jobs") },
    { to: '/headhunter', icon: UserSearch, label: t("headhunter") },
    { to: '/interviews', icon: Mic, label: t("interviews"), end: true },
    {
      to: '/interviews/workflow',
      icon: Mic,
      label: "Potek razgovorov",
      nested: true,
    },
    { to: '/offers', icon: FileText, label: t("offers") },
    { to: '/ai-agent', icon: Bot, label: t("aiAgent") },
    { to: '/pipeline', icon: GitBranch, label: t("pipeline") },
    { to: '/settings', icon: Settings, label: t("settings") },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div
      className={clsx(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[4.5rem]" : "w-56",
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
            <span className="truncate text-lg font-semibold tracking-tight logo-font">
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

      <nav className={clsx("flex-1 space-y-1 py-5", collapsed ? "px-2" : "px-3")}>
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
                  item.nested && !collapsed && "ml-6 py-2 text-xs",
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <Icon
                className={clsx(
                  "h-5 w-5 flex-shrink-0",
                  !collapsed && "mr-3",
                  item.nested && collapsed && "text-cyan-300 group-hover:text-cyan-200",
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
