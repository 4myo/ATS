import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Briefcase, CalendarDays, Pencil, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
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
import { useI18n } from "../lib/i18n";

type JobDetailRecord = {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  department: string | null;
  location: string | null;
  created_at: string;
};

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [job, setJob] = useState<JobDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
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
        .select("id, title, type, description, department, location, created_at")
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error) {
        setJob(null);
        setIsLoading(false);
        return;
      }

      setJob(data as JobDetailRecord);
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

    navigate("/jobs", { replace: true });
  };

  const openEditDialog = () => {
    if (!job) return;

    setEditTitle(job.title);
    setEditType(job.type ?? "");
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
        description: editDescription,
      })
      .eq("id", job.id)
      .select("id, title, type, description, department, location, created_at")
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
    }

    setJob(data as JobDetailRecord);
    setIsUpdating(false);
    setIsEditOpen(false);
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
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                  {t("active")}
                </span>
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
              disabled={isUpdating || !editTitle.trim() || !editType || !editDescription}
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

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <section className="surface-card p-6">
          <h2 className="text-base font-semibold text-foreground">
            {t("jobDescription")}
          </h2>
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {job.description || t("jobDescriptionUnavailable")}
          </p>
        </section>

        <aside className="surface-card p-6">
          <h2 className="text-base font-semibold text-foreground">
            {t("jobDetails")}
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("jobType")}
              </dt>
              <dd className="mt-1 text-foreground">{job.type || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("posted")}
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-foreground">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {new Date(job.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
