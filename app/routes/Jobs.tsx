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
import { useI18n } from "../lib/i18n";
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
  const { t } = useI18n();
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
        throw new Error(t("signedInRequiredJob"));
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
        error instanceof Error ? error.message : t("failedJobCreate");
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t("activeJobPostings")}</h1>
          <p className="text-sm subtle-text">{t("jobsSubtitle")}</p>
        </div>
        <button
          className="primary-action"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("createNewJob")}
        </button>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("createNewJobTitle")}</DialogTitle>
            <DialogDescription>
              {t("createJobDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="job-title">{t("jobTitle")}</Label>
                <Input
                  id="job-title"
                  placeholder="Senior Frontend Engineer"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-type">{t("jobType")}</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger id="job-type">
                    <SelectValue placeholder={t("selectType")} />
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
                <Label htmlFor="job-description">{t("jobDescription")}</Label>
                <Textarea
                  id="job-description"
                  placeholder={t("jobDescriptionPlaceholder")}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="min-h-[140px]"
                />
              </div>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            </div>

            <div className="muted-panel p-4">
              <h3 className="text-sm font-semibold text-foreground">{t("selectIcon")}</h3>
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
                          ? "border-ring bg-card text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-ring"
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
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSaveJob}
              disabled={isSaving || !jobTitle || !jobType || !jobDescription}
            >
              {isSaving ? t("saving") : t("saveJob")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => {
          const Icon = iconMap[job.icon ?? "briefcase"] ?? Briefcase;
          return (
            <div
              key={job.id}
              className="surface-card group relative flex min-h-[280px] flex-col justify-between p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="rounded-md bg-muted p-3 text-foreground">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                    {t("active")}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  <Link to={`/jobs/${job.id}`}>
                    <span className="absolute inset-0" />
                    {job.title}
                  </Link>
                </h3>
                {job.type && <p className="mt-1 text-sm text-muted-foreground">{job.type}</p>}
                {job.description && (
                  <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">
                    {job.description}
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  {t("posted")} {new Date(job.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && jobs.length === 0 && (
        <div className="surface-card border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noJobs")}
        </div>
      )}
    </div>
  );
}
