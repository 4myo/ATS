import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Code,
  Paintbrush,
  Database,
  Shield,
  Sparkles,
  Users,
  Megaphone,
  Plus,
  Clock,
} from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

type JobRow = {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  icon: string | null;
  created_at: string;
};

const iconOptions = [
  { value: "briefcase", label: "Briefcase", icon: Briefcase },
  { value: "code", label: "Code", icon: Code },
  { value: "paintbrush", label: "Design", icon: Paintbrush },
  { value: "database", label: "Data", icon: Database },
  { value: "shield", label: "Security", icon: Shield },
  { value: "sparkles", label: "AI", icon: Sparkles },
  { value: "users", label: "People", icon: Users },
  { value: "megaphone", label: "Marketing", icon: Megaphone },
];

export default function Jobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobIcon, setJobIcon] = useState("briefcase");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const iconMap = useMemo(
    () =>
      iconOptions.reduce<Record<string, typeof Briefcase>>((acc, option) => {
        acc[option.value] = option.icon;
        return acc;
      }, {}),
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (isMounted) {
          setJobs([]);
          setIsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, type, description, icon, created_at")
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        setJobs([]);
        setIsLoading(false);
        return;
      }

      setJobs((data ?? []) as JobRow[]);
      setIsLoading(false);
    };

    loadJobs();

    return () => {
      isMounted = false;
    };
  }, []);

  const resetForm = () => {
    setJobTitle("");
    setJobType("");
    setJobDescription("");
    setJobIcon("briefcase");
    setSaveError(null);
  };

  const handleSaveJob = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("You must be signed in to create a job.");
      }

      const { data, error } = await supabase
        .from("jobs")
        .insert({
          user_id: sessionData.session.user.id,
          title: jobTitle,
          type: jobType,
          description: jobDescription,
          icon: jobIcon,
        })
        .select("id, title, type, description, icon, created_at")
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setJobs((prev) => [data as JobRow, ...prev]);
      }

      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create job.";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Active Job Postings</h1>
        <button
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-gradient-to-r from-neutral-800 to-zinc-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:from-neutral-600 hover:to-neutral-500 hover:text-black"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create New Job
        </button>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Job</DialogTitle>
            <DialogDescription>
              Add a new job posting with an icon, title, type, and description.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="job-title">Job title</Label>
                <Input
                  id="job-title"
                  placeholder="Senior Frontend Engineer"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-type">Job type</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger id="job-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Full-time", "Part-time", "Contract", "Internship"].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-description">Job description</Label>
                <Textarea
                  id="job-description"
                  placeholder="Describe role expectations, responsibilities, and requirements..."
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="min-h-[140px]"
                />
              </div>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Select an icon</h3>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {iconOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = jobIcon === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setJobIcon(option.value)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-indigo-500 bg-white text-indigo-600"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                resetForm();
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveJob}
              disabled={isSaving || !jobTitle || !jobType || !jobDescription}
            >
              {isSaving ? "Saving..." : "Save Job"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const Icon = iconMap[job.icon ?? "briefcase"] ?? Briefcase;
          return (
            <div
              key={job.id}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-indigo-50 p-3">
                    <Icon className="h-6 w-6 text-indigo-600" />
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
                {job.type && <p className="mt-1 text-sm text-slate-500">{job.type}</p>}
                {job.description && (
                  <p className="mt-4 text-sm text-slate-500 line-clamp-3">
                    {job.description}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="flex items-center text-xs text-slate-400">
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && jobs.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No jobs yet. Create your first job to get started.
        </div>
      )}
    </div>
  );
}
