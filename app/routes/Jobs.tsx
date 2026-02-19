import { useAppStore } from '../store';
import { Briefcase, MapPin, Users, Plus, Clock } from 'lucide-react';
import { Link } from 'react-router';

export default function Jobs() {
  const { jobs } = useAppStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Active Job Postings</h1>
        <button className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          Create New Job
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-indigo-50 p-3">
                  <Briefcase className="h-6 w-6 text-indigo-600" />
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                  Active
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-indigo-600">
                <Link to={`/jobs/${job.id}`}>
                  <span className="absolute inset-0" />
                  {job.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-slate-500">{job.department}</p>
              
              <div className="mt-6 flex items-center space-x-4 text-sm text-slate-500">
                <div className="flex items-center">
                  <MapPin className="mr-1.5 h-4 w-4 text-slate-400" />
                  {job.location}
                </div>
                <div className="flex items-center">
                  <Users className="mr-1.5 h-4 w-4 text-slate-400" />
                  {job.applicantsCount} Applicants
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center text-xs text-slate-400">
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                Posted {job.postedAt}
              </div>
              <div className="flex -space-x-2">
                 {[1,2,3].map(i => (
                    <div key={i} className="h-6 w-6 rounded-full bg-slate-200 border-2 border-white" />
                 ))}
                 <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 border-2 border-white text-[10px] font-medium text-slate-500">
                    +12
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
