import { NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  MessageSquare,
  Settings,
  LogOut,
  Hexagon,
} from "lucide-react";
import { clsx } from "clsx";
import { supabase } from "../lib/supabase";

export function Sidebar() {
  const navigate = useNavigate();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/applicants', icon: Users, label: 'Applicants' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex h-screen w-55 flex-col bg-gradient-to-r from-stone-700 to-zinc-600 text-white">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <img
          src="/images/logo.png"
          alt="Smart ATS Logo"
          className="mr-5 h-12 w-12 object-contain"
        />
        <span className="text-xl font-semibold text-white logo-font tracking-tight">Smart ATS</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md logo-font transition-colors',
                isActive
                  ? 'bg-neutral-900 text-white logo-font shadow-md shadow-pink-500/15'
                  : 'text-stone-400 hover:bg-neutral-800 hover:text-white'
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

      <div className="border-t border-slate-800 p-4">
        <button
          className="group flex w-full items-center px-3 py-2 text-sm logo-font font-medium text-stone-400 rounded-md hover:bg-neutral-800 hover:text-white transition-colors"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
