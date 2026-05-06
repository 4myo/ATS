import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Code,
  Paintbrush,
  Database,
  Shield,
  Sparkles,
  Users,
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";
import { updateCachedApplicants } from "../lib/candidateListCache";
import {
  fetchJobList,
  getCachedJobList,
  setCachedJobList,
  updateCachedJobList,
  type CachedJobListRow,
} from "../lib/jobCache";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useI18n } from "../lib/i18n";
import { logActivityEvent } from "../lib/activityLog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

type JobRow = CachedJobListRow;

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

const jobsPerPage = 6;

export default function Jobs() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cachedJobList = getCachedJobList();
  const [jobs, setJobs] = useState<JobRow[]>(cachedJobList?.jobs ?? []);
  const [isLoading, setIsLoading] = useState(!cachedJobList);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobOpenings, setJobOpenings] = useState("1");
  const [jobDescription, setJobDescription] = useState("");
  const [jobIcon, setJobIcon] = useState("briefcase");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobType, setEditJobType] = useState("");
  const [editJobOpenings, setEditJobOpenings] = useState("1");
  const [editJobDescription, setEditJobDescription] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [jobPage, setJobPage] = useState(1);

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
      const cached = getCachedJobList();
      if (cached) {
        setJobs(cached.jobs);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (isMounted) {
          setJobs([]);
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextJobs = await fetchJobList({ force: Boolean(cached) });
        if (!isMounted) return;
        setJobs(nextJobs);
      } catch (_error) {
        if (isMounted && !cached) setJobs([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadJobs();

    return () => {
      isMounted = false;
    };
  }, []);

  const resetForm = () => {
    setJobTitle("");
    setJobType("");
    setJobOpenings("1");
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
          openings: Math.max(1, Number(jobOpenings) || 1),
          description: jobDescription,
          icon: jobIcon,
        })
        .select("id, title, type, description, icon, status, openings, created_at")
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const nextJob = {
          ...(data as Omit<JobRow, "applicantsCount">),
          applicantsCount: 0,
        };
        setJobs((prev) => {
          const nextJobs = [nextJob, ...prev];
          setCachedJobList(nextJobs);
          return nextJobs;
        });
        setJobPage(1);
        void logActivityEvent({
          action: "job_created",
          entityType: "job",
          entityId: data.id,
          entityLabel: data.title,
          toValue: data.status ?? "active",
          metadata: { type: data.type, openings: data.openings },
        });
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

  const openEditJob = (job: JobRow) => {
    setEditingJob(job);
    setEditJobTitle(job.title);
    setEditJobType(job.type ?? "");
    setEditJobOpenings(String(job.openings ?? 1));
    setEditJobDescription(job.description ?? "");
    setUpdateError(null);
  };

  const closeEditJob = () => {
    if (isUpdating) return;

    setEditingJob(null);
    setUpdateError(null);
  };

  const handleUpdateJob = async () => {
    if (!editingJob) return;

    setIsUpdating(true);
    setUpdateError(null);
    const previousTitle = editingJob.title;
    const nextTitle = editJobTitle.trim();

    const { data, error } = await supabase
      .from("jobs")
      .update({
        title: nextTitle,
        type: editJobType,
        openings: Math.max(1, Number(editJobOpenings) || 1),
        description: editJobDescription,
      })
      .eq("id", editingJob.id)
        .select("id, title, type, description, icon, status, openings, created_at")
      .single();

    if (error) {
      setUpdateError(error.message || t("failedJobUpdate"));
      setIsUpdating(false);
      return;
    }

    if (previousTitle !== nextTitle) {
      const { error: candidateUpdateError } = await supabase
        .from("candidates")
        .update({ job_title: nextTitle })
        .eq("job_title", previousTitle);

      if (candidateUpdateError) {
        setUpdateError(candidateUpdateError.message || t("failedJobUpdate"));
        setIsUpdating(false);
        return;
      }

      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.role === previousTitle
            ? { ...applicant, role: nextTitle }
            : applicant,
        ),
      );
    }

    if (data) {
      void logActivityEvent({
        action: "job_updated",
        entityType: "job",
        entityId: editingJob.id,
        entityLabel: data.title,
        fromValue: previousTitle,
        toValue: data.title,
        metadata: {
          type: data.type,
          openings: data.openings,
          title_changed: previousTitle !== nextTitle,
        },
      });
      setJobs((prev) =>
        prev.map((job) =>
          job.id === editingJob.id
            ? {
                ...(data as Omit<JobRow, "applicantsCount">),
                applicantsCount: job.applicantsCount,
              }
            : job,
        ),
      );
      updateCachedJobList((cachedJobs) =>
        cachedJobs.map((job) =>
          job.id === editingJob.id
            ? {
                ...(data as Omit<JobRow, "applicantsCount">),
                applicantsCount: job.applicantsCount,
              }
            : job,
        ),
      );
    }

    setIsUpdating(false);
    setEditingJob(null);
  };

  const handleDeleteJob = async (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    const confirmed = window.confirm(t("deleteJobConfirm"));
    if (!confirmed) return;

    setDeletingJobId(jobId);
    setDeleteError(null);

    const { error } = await supabase.from("jobs").delete().eq("id", jobId);

    if (error) {
      setDeleteError(error.message || t("failedJobDelete"));
      setDeletingJobId(null);
      return;
    }

    setJobs((prev) => {
      const nextJobs = prev.filter((job) => job.id !== jobId);
      setCachedJobList(nextJobs);
      return nextJobs;
    });
    void logActivityEvent({
      action: "job_deleted",
      entityType: "job",
      entityId: jobId,
      entityLabel: job?.title ?? "Delovno mesto",
      metadata: { status: job?.status, openings: job?.openings },
    });
    setDeletingJobId(null);
  };

  const updateJobStatus = async (jobId: string, status: "active" | "inactive") => {
    setDeleteError(null);
    const job = jobs.find((item) => item.id === jobId);

    const { error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("id", jobId);

    if (error) {
      setDeleteError(error.message || t("failedJobUpdate"));
      return;
    }

    setJobs((prev) => {
      const nextJobs = prev.map((job) =>
        job.id === jobId ? { ...job, status } : job,
      );
      setCachedJobList(nextJobs);
      return nextJobs;
    });
    void logActivityEvent({
      action: "job_status_changed",
      entityType: "job",
      entityId: jobId,
      entityLabel: job?.title ?? "Delovno mesto",
      fromValue: job?.status ?? "active",
      toValue: status,
    });
  };

  const jobPageCount = Math.max(1, Math.ceil(jobs.length / jobsPerPage));
  const paginatedJobs = jobs.slice(
    (jobPage - 1) * jobsPerPage,
    jobPage * jobsPerPage,
  );

  useEffect(() => {
    setJobPage((page) => Math.min(page, jobPageCount));
  }, [jobPageCount]);

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
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>{t("createNewJobTitle")}</DialogTitle>
            <DialogDescription>
              {t("createJobDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
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
                <Label htmlFor="job-openings">{t("jobOpenings")}</Label>
                <Input
                  id="job-openings"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={jobOpenings}
                  onChange={(event) => setJobOpenings(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-description">{t("jobDescription")}</Label>
                <Textarea
                  id="job-description"
                  placeholder={t("jobDescriptionPlaceholder")}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="h-64 min-h-40 max-h-[40vh] resize-y overflow-y-auto [field-sizing:fixed]"
                />
              </div>
              {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            </div>

            <div className="muted-panel h-fit p-4">
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
          <div className="flex flex-col-reverse gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
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
              disabled={
                isSaving ||
                !jobTitle ||
                !jobType ||
                !jobDescription ||
                Number(jobOpenings) < 1
              }
            >
              {isSaving ? t("saving") : t("saveJob")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingJob)}
        onOpenChange={(open) => (open ? undefined : closeEditJob())}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>{t("editJobTitle")}</DialogTitle>
            <DialogDescription>{t("editJobDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="edit-list-job-title">{t("jobTitle")}</Label>
              <Input
                id="edit-list-job-title"
                placeholder="Senior Frontend Engineer"
                value={editJobTitle}
                onChange={(event) => setEditJobTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-list-job-type">{t("jobType")}</Label>
              <Select value={editJobType} onValueChange={setEditJobType}>
                <SelectTrigger id="edit-list-job-type">
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
              <Label htmlFor="edit-list-job-openings">{t("jobOpenings")}</Label>
              <Input
                id="edit-list-job-openings"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={editJobOpenings}
                onChange={(event) => setEditJobOpenings(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-list-job-description">{t("jobDescription")}</Label>
              <Textarea
                id="edit-list-job-description"
                placeholder={t("jobDescriptionPlaceholder")}
                value={editJobDescription}
                onChange={(event) => setEditJobDescription(event.target.value)}
                className="h-72 min-h-40 max-h-[48vh] resize-y overflow-y-auto [field-sizing:fixed]"
              />
            </div>
            {updateError ? <p className="text-sm text-red-500">{updateError}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={closeEditJob}
              disabled={isUpdating}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleUpdateJob}
              disabled={
                isUpdating ||
                !editJobTitle.trim() ||
                !editJobType ||
                !editJobDescription ||
                Number(editJobOpenings) < 1
              }
            >
              {isUpdating ? t("saving") : t("updateJob")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {deleteError ? (
          <div className="surface-card border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:col-span-2 xl:col-span-3">
            {deleteError}
          </div>
        ) : null}

        {paginatedJobs.map((job) => {
          const Icon = iconMap[job.icon ?? "briefcase"] ?? Briefcase;
          const jobPath = `/jobs/${job.id}`;
          const isInactive = (job.status ?? "active") === "inactive";

          const openJob = () => {
            navigate(jobPath);
          };

          return (
            <div
              key={job.id}
              role="link"
              tabIndex={0}
              onClick={openJob}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openJob();
                }
              }}
              className={`surface-card flex min-h-[280px] cursor-pointer flex-col justify-between p-6 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                isInactive ? "opacity-55 grayscale" : ""
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="relative rounded-md bg-muted p-3 text-foreground">
                    <Icon className="h-6 w-6" />
                    <span className="absolute -right-2 -top-2 inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground ring-2 ring-card">
                      {job.applicantsCount}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      isInactive
                        ? "bg-muted text-muted-foreground ring-border"
                        : "bg-green-50 text-green-700 ring-green-600/20"
                    }`}
                  >
                    {isInactive ? t("inactive") : t("active")}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {job.title}
                </h3>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {job.type ? <span>{job.type}</span> : null}
                  <span>{t("jobOpenings")}: {job.openings ?? 1}</span>
                </div>
                {job.description && (
                  <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">
                    {job.description}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  {job.applicantsCount}{" "}
                  {job.applicantsCount === 1 ? t("applicant") : t("applicants")}
                </div>
                <div
                  className="flex flex-wrap items-center gap-2"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditJob(job)}
                    className="gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    {t("editJob")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateJobStatus(job.id, isInactive ? "active" : "inactive")
                    }
                    className="gap-2"
                  >
                    {isInactive ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    {isInactive ? t("activateJob") : t("deactivateJob")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteJob(job.id)}
                    disabled={deletingJobId === job.id}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingJobId === job.id ? t("deleting") : t("deleteJob")}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && jobs.length > jobsPerPage && (
        <div className="flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setJobPage((page) => Math.max(page - 1, 1))}
              disabled={jobPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-16 px-2 text-center text-xs font-medium text-muted-foreground">
              {jobPage} / {jobPageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setJobPage((page) => Math.min(page + 1, jobPageCount))}
              disabled={jobPage === jobPageCount}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="surface-card border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noJobs")}
        </div>
      )}
    </div>
  );
}
