import { Bell, Shield, User, Sliders } from "lucide-react";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-indigo-50 p-2 text-indigo-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
              <p className="text-sm text-slate-500">Manage your personal details.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>Name</span>
              <span className="font-medium text-slate-900">Alex Morgan</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Email</span>
              <span className="font-medium text-slate-900">alex@talentai.io</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-emerald-50 p-2 text-emerald-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
              <p className="text-sm text-slate-500">Keep up with candidates.</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span>New applicant alerts</span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                Enabled
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Interview reminders</span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                Enabled
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-amber-50 p-2 text-amber-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Security</h2>
              <p className="text-sm text-slate-500">Update password and access.</p>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            Two-factor authentication is <span className="font-semibold text-slate-900">enabled</span>.
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-slate-100 p-2 text-slate-600">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Preferences</h2>
              <p className="text-sm text-slate-500">Customize your workspace.</p>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            Default view: <span className="font-semibold text-slate-900">Dashboard</span>
          </div>
        </div>
      </div>
    </div>
  );
}
