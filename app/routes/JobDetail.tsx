import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Archive, ArrowLeft, Briefcase, CalendarDays, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import type { Stage } from "../store";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { supabase } from "../lib/supabase";
import { dedupeCandidateRows } from "../lib/candidateRows";
import { updateCachedApplicants } from "../lib/candidateListCache";
import { syncJobStatusForTitle, updateCachedJobList } from "../lib/jobCache";
import { useI18n } from "../lib/i18n";
import { logActivityEvent } from "../lib/activityLog";

type JobDetailRecord = {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  department: string | null;
  location: string | null;
  openings: number | null;
  status: string | null;
  created_at: string;
};

type JobCandidate = {
  id: string;
  name: string;
  stage: Stage;
  aiScore: number;
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, stageLabel } = useI18n();
  const [job, setJob] = useState<JobDetailRecord | null>(null);
  const [jobCandidates, setJobCandidates] = useState<JobCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editOpenings, setEditOpenings] = useState("1");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadJob = async () => {
      if (!id) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, type, description, department, location, openings, status, created_at")
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error) {
        setJob(null);
        setIsLoading(false);
        return;
      }

      const { data: candidateRows } = await supabase
        .from("candidates")
        .select("id, full_name, job_title, stage, email, resume_path, ats_score, created_at")
        .eq("job_title", data.title)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      const nextCandidates = dedupeCandidateRows(
        (candidateRows ?? []) as Array<Record<string, unknown>>,
      ).map((candidate) => ({
          id: candidate.id as string,
          name: (candidate.full_name as string | null | undefined) ?? t("candidate"),
          stage: (candidate.stage as Stage) ?? "Applied",
          aiScore: Number(candidate.ats_score ?? 0),
      }));
      const acceptedCount = nextCandidates.filter(
        (candidate) => candidate.stage === "Accepted",
      ).length;
      const openings = Math.max(1, Number(data.openings ?? 1));
      let nextJob = data as JobDetailRecord;

      if ((data.status ?? "active") !== "inactive" && acceptedCount >= openings) {
        const { error: statusError } = await supabase
          .from("jobs")
          .update({ status: "inactive" })
          .eq("id", data.id);

        if (!statusError) {
          nextJob = { ...nextJob, status: "inactive" };
          updateCachedJobList((jobs) =>
            jobs.map((cachedJob) =>
              cachedJob.id === data.id ? { ...cachedJob, status: "inactive" } : cachedJob,
            ),
          );
        }
      }

      setJob(nextJob);
      setJobCandidates(
        nextCandidates,
      );
      setIsLoading(false);
    };

    loadJob();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleDeleteJob = async () => {
    if (!job) return;

    const confirmed = window.confirm(t("deleteJobConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    const { error } = await supabase.from("jobs").delete().eq("id", job.id);

    if (error) {
      setDeleteError(error.message || t("failedJobDelete"));
      setIsDeleting(false);
      return;
    }

    updateCachedJobList((jobs) => jobs.filter((cachedJob) => cachedJob.id !== job.id));
    void logActivityEvent({
      action: "job_deleted",
      entityType: "job",
      entityId: job.id,
      entityLabel: job.title,
      metadata: { status: job.status, openings: job.openings },
    });
    navigate("/jobs", { replace: true });
  };

  const openEditDialog = () => {
    if (!job) return;

    setEditTitle(job.title);
    setEditType(job.type ?? "");
    setEditOpenings(String(job.openings ?? 1));
    setEditDescription(job.description ?? "");
    setUpdateError(null);
    setIsEditOpen(true);
  };

  const closeEditDialog = () => {
    if (isUpdating) return;

    setIsEditOpen(false);
    setUpdateError(null);
  };

  const handleUpdateJob = async () => {
    if (!job) return;

    setIsUpdating(true);
    setUpdateError(null);
    const previousTitle = job.title;
    const nextTitle = editTitle.trim();

    const { data, error } = await supabase
      .from("jobs")
      .update({
        title: nextTitle,
        type: editType,
        openings: Math.max(1, Number(editOpenings) || 1),
        description: editDescription,
      })
      .eq("id", job.id)
      .select("id, title, type, description, department, location, openings, status, created_at")
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

    setJob(data as JobDetailRecord);
    void logActivityEvent({
      action: "job_updated",
      entityType: "job",
      entityId: job.id,
      entityLabel: data.title,
      fromValue: previousTitle,
      toValue: data.title,
      metadata: {
        type: data.type,
        openings: data.openings,
        title_changed: previousTitle !== nextTitle,
      },
    });
    updateCachedJobList((jobs) =>
      jobs.map((cachedJob) =>
        cachedJob.id === job.id
          ? {
              ...cachedJob,
              title: data.title,
              type: data.type,
              description: data.description,
              openings: Math.max(1, Number(data.openings ?? 1)),
              status: data.status ?? cachedJob.status,
            }
          : cachedJob,
      ),
    );
    setIsUpdating(false);
    setIsEditOpen(false);
    await syncJobStatusForTitle(data.title);
  };

  const updateJobStatus = async (status: "active" | "inactive") => {
    if (!job) return;

    setDeleteError(null);
    const previousJob = job;
    setJob({ ...job, status });

    const { error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("id", job.id);

    if (error) {
      setJob(previousJob);
      setDeleteError(error.message || t("failedJobUpdate"));
      return;
    }

    updateCachedJobList((jobs) =>
      jobs.map((cachedJob) =>
        cachedJob.id === job.id ? { ...cachedJob, status } : cachedJob,
      ),
    );
    void logActivityEvent({
      action: "job_status_changed",
      entityType: "job",
      entityId: job.id,
      entityLabel: job.title,
      fromValue: previousJob.status ?? "active",
      toValue: status,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("loadingJob")}
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-container">
        <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("backToJobs")}
        </Link>
        <div className="surface-card mt-6 border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("jobNotFound")}
        </div>
      </div>
    );
  }

  const acceptedCount = jobCandidates.filter(
    (candidate) => candidate.stage === "Accepted",
  ).length;
  const openings = Math.max(1, Number(job.openings ?? 1));
  const isOverfilled = acceptedCount > openings;
  const isFilled = acceptedCount >= openings;

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/jobs" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t("backToJobs")}
          </Link>
          <div className="mt-5 flex items-start gap-4">
            <div className="rounded-md bg-muted p-3 text-foreground">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h1 className="page-title">{job.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {job.type ? <span>{job.type}</span> : null}
                {job.location ? <span>{job.location}</span> : null}
                <span
                  className={
                    isOverfilled
                      ? "font-semibold text-red-600"
                      : isFilled
                        ? "font-semibold text-amber-600"
                        : ""
                  }
                >
                  {t("jobOpenings")}: {acceptedCount}/{openings}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    (job.status ?? "active") === "inactive"
                      ? "bg-muted text-muted-foreground ring-border"
                      : "bg-green-50 text-green-700 ring-green-600/20"
                  }`}
                >
                  {(job.status ?? "active") === "inactive" ? t("inactive") : t("active")}
                </span>
                {isOverfilled ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                    Preseženo število mest
                  </span>
                ) : isFilled ? (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    Delo je zapolnjeno
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={openEditDialog}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" />
            {t("editJob")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              updateJobStatus(
                (job.status ?? "active") === "inactive" ? "active" : "inactive",
              )
            }
            className="gap-2"
          >
            {(job.status ?? "active") === "inactive" ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {(job.status ?? "active") === "inactive"
              ? t("activateJob")
              : t("deactivateJob")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDeleteJob}
            disabled={isDeleting}
            className="gap-2 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? t("deleting") : t("deleteJob")}
          </Button>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => (open ? setIsEditOpen(true) : closeEditDialog())}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle>{t("editJobTitle")}</DialogTitle>
            <DialogDescription>{t("editJobDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="edit-job-title">{t("jobTitle")}</Label>
              <Input
                id="edit-job-title"
                placeholder="Senior Frontend Engineer"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-job-type">{t("jobType")}</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger id="edit-job-type">
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
              <Label htmlFor="edit-job-openings">{t("jobOpenings")}</Label>
              <Input
                id="edit-job-openings"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={editOpenings}
                onChange={(event) => setEditOpenings(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-job-description">{t("jobDescription")}</Label>
              <Textarea
                id="edit-job-description"
                placeholder={t("jobDescriptionPlaceholder")}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="h-72 min-h-40 max-h-[48vh] resize-y overflow-y-auto [field-sizing:fixed]"
              />
            </div>
            {updateError ? <p className="text-sm text-red-500">{updateError}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={closeEditDialog}
              disabled={isUpdating}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleUpdateJob}
              disabled={
                isUpdating ||
                !editTitle.trim() ||
                !editType ||
                !editDescription ||
                Number(editOpenings) < 1
              }
            >
              {isUpdating ? t("saving") : t("updateJob")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {deleteError ? (
        <div className="surface-card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {deleteError}
        </div>
      ) : null}

      {isOverfilled ? (
        <div className="surface-card border-red-200 bg-red-50 p-4 text-sm text-red-800">
          To delovno mesto ima {acceptedCount}/{openings} sprejetih kandidatov. Povečajte število mest ali preglejte sprejete kandidate.
        </div>
      ) : isFilled ? (
        <div className="surface-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          To delovno mesto je zapolnjeno ({acceptedCount}/{openings}). Novi sprejemi zahtevajo povečanje števila mest.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="surface-card p-6">
          <h2 className="text-base font-semibold text-foreground">
            {t("jobDescription")}
          </h2>
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {job.description || t("jobDescriptionUnavailable")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>{t("posted")} {new Date(job.created_at).toLocaleDateString()}</span>
          </div>
        </section>

        <aside className="surface-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("jobCandidates")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("jobCandidatesSubtitle")}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              <Users className="h-3.5 w-3.5" />
              {jobCandidates.length}
            </span>
          </div>

          {jobCandidates.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>{t("candidate")}</span>
                <span>{t("stage")}</span>
              </div>
              <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
                {jobCandidates.map((candidate) => (
                  <Link
                    key={candidate.id}
                    to={`/applicants/${candidate.id}?returnTo=${encodeURIComponent(`/jobs/${job.id}`)}`}
                    state={{ returnTo: `/jobs/${job.id}` }}
                    className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/45"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {candidate.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {candidate.aiScore}% {t("match")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="justify-center">
                      {stageLabel(candidate.stage)}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              {t("noJobCandidates")}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
