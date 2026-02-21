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
    { to: '/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex h-screen w-64 flex-col bg-slate-900 text-white">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <Hexagon className="h-8 w-8 text-indigo-500 fill-indigo-500 mr-2" />
        <span className="text-xl font-bold tracking-tight">TalentAI</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
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
          className="group flex w-full items-center px-3 py-2 text-sm font-medium text-slate-400 rounded-md hover:bg-slate-800 hover:text-white transition-colors"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
