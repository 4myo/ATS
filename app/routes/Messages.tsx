import { Mail, MessageSquare, Search } from "lucide-react";

export default function Messages() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        <button className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
          <MessageSquare className="mr-2 h-4 w-4" />
          New Message
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div className="grid gap-3">
          {[
            { name: "Sarah Jenkins", role: "Frontend Engineer", last: "Can we schedule the next interview?" },
            { name: "Michael Chen", role: "Frontend Engineer", last: "Shared the take-home submission." },
            { name: "Emily Davis", role: "Product Designer", last: "Thanks for the feedback!" },
          ].map((thread) => (
            <div
              key={thread.name}
              className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{thread.name}</p>
                <p className="text-xs text-slate-500">{thread.role}</p>
                <p className="mt-1 text-sm text-slate-600">{thread.last}</p>
              </div>
              <span className="mt-1 inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                <Mail className="mr-1 h-3 w-3" />
                New
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
