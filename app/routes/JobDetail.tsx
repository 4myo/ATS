import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Briefcase, CalendarDays, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
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
