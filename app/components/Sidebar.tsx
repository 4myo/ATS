import { NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Bot,
  FileText,
  GitBranch,
  Mic,
  UserSearch,
  Settings,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

export function Sidebar() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t("dashboard"), end: true },
    { to: '/applicants', icon: Users, label: t("applicants") },
    { to: '/jobs', icon: Briefcase, label: t("jobs") },
    { to: '/headhunter', icon: UserSearch, label: t("headhunter") },
    { to: '/interviews', icon: Mic, label: t("interviews"), end: true },
    { to: '/interviews/workflow', icon: GitBranch, label: "Potek razgovorov", nested: true },
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
    <div className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <img
          src="/images/logo.png"
          alt="Smart ATS Logo"
          className="mr-3 h-10 w-10 object-contain"
        />
        <span className="text-lg font-semibold tracking-tight logo-font">Smart ATS</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'group flex items-center rounded-md px-3 py-2.5 text-sm font-medium logo-font transition-colors',
                item.nested && "ml-6 py-2 text-xs",
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <item.icon
              className="mr-3 h-5 w-5 flex-shrink-0"
              aria-hidden="true"
            />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          className="group flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground logo-font"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-5 w-5" />
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}
