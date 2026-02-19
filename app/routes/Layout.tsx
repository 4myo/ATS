import { Outlet } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Search, Bell, HelpCircle } from 'lucide-react';
import { Link } from 'react-router';

export function Layout() {
  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <div className="flex-none">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
          <div className="flex w-96 items-center rounded-lg bg-slate-100 px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidates, jobs..."
              className="ml-2 w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative p-2 text-slate-400 hover:text-indigo-600 transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
              <HelpCircle className="h-5 w-5" />
            </button>
            <div className="h-6 w-px bg-slate-200" />
            <Link to="/settings" className="flex items-center space-x-2">
              <img
                className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                alt="User"
              />
              <span className="text-sm font-medium text-slate-700">Alex M.</span>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
