import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useAppStore, type Applicant, type Stage } from "../store";
import { ApplicantCard } from "../components/ApplicantCard";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { convertPdfToImage, extractPdfText } from "../lib/pdf";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

export default function Applicants() {
  const { t, stageLabel } = useI18n();
  const { applicants } = useAppStore();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; description?: string | null }>
  >([]);
  const [remoteApplicants, setRemoteApplicants] = useState<Applicant[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [filterScore, setFilterScore] = useState<number>(0);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [resumePreview, setResumePreview] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<string>("");
  const [stage, setStage] = useState<Stage>("Applied");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mapCandidateRow = (row: Record<string, any>) => {
    const skillProfile = row.skill_profile as Record<string, number> | undefined;

    return {
      id: row.id,
      name: row.full_name,
      role: row.job_title,
      stage: (row.stage as Stage) ?? "Applied",
      analysisStatus: row.analysis_status ?? "pending_ai",
      aiScore: row.ats_score ?? 0,
      skills: row.skills ?? [],
      experience: Number(row.years_experience ?? 0),
      location: row.location ?? "Location pending",
      avatar: row.resume_preview_url ?? "",
      email: row.email ?? "",
      phone: "",
      summary: row.analysis_summary ?? "",
      analysisStrengths: row.analysis_strengths ?? [],
      analysisConcerns: row.analysis_concerns ?? [],
      skillProfile: skillProfile
        ? {
            technical: skillProfile.technical ?? 0,
            communication: skillProfile.communication ?? 0,
            experience: skillProfile.experience ?? 0,
            leadership: skillProfile.leadership ?? 0,
            problemSolving: skillProfile.problem_solving ?? 0,
            collaboration:
              skillProfile.collaboration ?? skillProfile.culture ?? 0,
          }
        : undefined,
      matchAnalysis: {
        pros: row.analysis_strengths ?? [],
        cons: row.analysis_concerns ?? [],
      },
    } as Applicant;
  };

  const loadCandidates = useCallback(async () => {
    const [{ data: candidateRows, error: candidateError }, { data: jobRows, error: jobError }] =
      await Promise.all([
        supabase
          .from("candidates")
          .select(
            "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_preview_url, analysis_summary, analysis_strengths, analysis_concerns, skill_profile, analysis_status, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("id, title, description")
          .order("created_at", { ascending: false }),
      ]);

    if (candidateError || jobError) {
      setRemoteApplicants([]);
      setJobs([]);
      setIsLoadingCandidates(false);
      return;
    }

    setRemoteApplicants(((candidateRows ?? []) as Array<Record<string, any>>).map(mapCandidateRow));
    setJobs(
      (jobRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
      })),
    );
    setIsLoadingCandidates(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadIfMounted = async () => {
      await loadCandidates();
      if (!isMounted) return;
    };

    loadIfMounted();

    return () => {
      isMounted = false;
    };
  }, [loadCandidates]);

  useEffect(() => {
    const query = searchParams.get("search");
    if (query) {
      setSearchQuery(query);
    }
  }, [searchParams]);

  const handleResumeUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsConverting(true);
    setResumeError(null);
    setResumeFileName(file.name);
    setResumeFile(file);
    setResumeText("");

    const result = await convertPdfToImage(file);
    if (result.imageUrl) {
      setResumePreview(result.imageUrl);
      const text = await extractPdfText(file);
      const normalized = text.trim() ? text : result.ocrText ?? "";
      setResumeText(normalized);
    } else {
      setResumePreview(null);
      setResumeError(result.error ?? t("previewFailed"));
      setResumeText("");
    }

    setIsConverting(false);
  };

  const resetForm = () => {
    setFullName("");
    setJobTitle("");
    setJobDescription("");
    setStage("Applied");
    setResumeFile(null);
    setResumeFileName(null);
    setResumePreview(null);
    setResumeError(null);
    setResumeText("");
    setSaveError(null);
    setSaveStatus(null);
  };

  const handleDeleteApplicant = async (id: string) => {
    const confirmed = window.confirm(
      t("deleteApplicantConfirm"),
    );
    if (!confirmed) return;

    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (!error) {
      setRemoteApplicants((prev) => prev.filter((app) => app.id !== id));
    }
  };

  const handleSaveCandidate = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveStatus(t("savingCandidateProfile"));

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      let resumePath: string | null = null;
      let normalizedResumeText = resumeText;

      if (resumeFile && !normalizedResumeText.trim()) {
        setSaveStatus(t("extractingResumeText"));
        const extracted = await extractPdfText(resumeFile);
        normalizedResumeText = extracted;
        setResumeText(extracted);
      }

      if (resumeFile && !normalizedResumeText.trim()) {
        throw new Error(
          t("resumeExtractFailed"),
        );
      }

      if (resumeFile) {
        setSaveStatus(t("uploadingResume"));
        const fileExt = resumeFile.name.split(".").pop() || "pdf";
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${sessionData.session.user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(filePath, resumeFile, { upsert: false });

        if (uploadError) {
          throw uploadError;
        }

        resumePath = filePath;
      }

      setSaveStatus(t("savingCandidateProfile"));
      const { data: inserted, error: insertError } = await supabase
        .from("candidates")
        .insert({
          user_id: sessionData.session.user.id,
          full_name: fullName,
          job_title: jobTitle,
          stage,
          resume_path: resumePath,
          resume_preview_url: resumePreview,
          analysis_status: "pending_ai",
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      if (inserted?.id) {
        setRemoteApplicants((prev) => [
          {
            id: inserted.id,
            name: fullName,
            role: jobTitle,
            stage,
            analysisStatus: "pending_ai",
            aiScore: 0,
            skills: [],
            experience: 0,
            location: "Location pending",
            avatar: resumePreview ?? "",
            email: "",
            phone: "",
            summary: "",
            matchAnalysis: { pros: [], cons: [] },
          },
          ...prev,
        ]);

        setSaveStatus(t("runningAiAnalysis"));

        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`;
        const analysisResponse = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
              candidateId: inserted.id,
              jobTitle,
              jobDescription,
              resumeText: normalizedResumeText,
          }),
        });

        if (!analysisResponse.ok) {
          const analysisMessage = await analysisResponse.text();
          await supabase
            .from("candidates")
            .update({ analysis_status: "failed" })
            .eq("id", inserted.id);

          throw new Error(
            `${t("candidateSavedAiFailed")} ${analysisMessage || analysisResponse.statusText}`,
          );
        }
      }

      await loadCandidates();
      resetForm();
      setIsAddOpen(false);
    } catch (error) {
      await loadCandidates();
      const message =
        error instanceof Error ? error.message : t("failedCandidateSave");
      setSaveError(message);
    } finally {
      setIsSaving(false);
      setSaveStatus(null);
    }
  };

  const filteredApplicants = remoteApplicants.filter((app) => {
    return (
      (jobFilter === "all" || app.role === jobFilter) &&
      app.aiScore >= filterScore &&
      (app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       app.role.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">{t("applicants")}</h1>
          <p className="text-sm subtle-text">{t("applicantsSubtitle")}</p>
        </div>
        <div className="mt-4 flex space-x-3 sm:mt-0">
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsAddOpen(true)}
          >
            {t("addCandidate")}
          </Button>
        </div>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="grid max-h-[94vh] w-[min(1180px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-border bg-card p-4 text-card-foreground sm:max-w-none sm:p-5">
          <DialogHeader>
            <DialogTitle>{t("addCandidate")}</DialogTitle>
            <DialogDescription>
              {t("addCandidateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-6 overflow-y-auto pr-1 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-8 xl:overflow-hidden xl:pr-0">
            <div className="grid min-w-0 content-start gap-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor="candidate-name">{t("fullName")}</Label>
                <Input
                  id="candidate-name"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="candidate-role">{t("jobTitle")}</Label>
                <Select
                  value={jobTitle}
                  onValueChange={(value) => {
                    setJobTitle(value);
                    const selectedJob = jobs.find((job) => job.title === value);
                    setJobDescription(selectedJob?.description ?? "");
                  }}
                >
                  <SelectTrigger id="candidate-role">
                    <SelectValue placeholder={t("selectJob")} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.title}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="candidate-stage">{t("stage")}</Label>
                <Select value={stage} onValueChange={(value) => setStage(value as Stage)}>
                  <SelectTrigger id="candidate-stage">
                    <SelectValue placeholder={t("selectStage")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Applied", "Screening", "Interview", "Offer", "Rejected"] as Stage[]).map(
                      (stageOption) => (
                        <SelectItem key={stageOption} value={stageOption}>
                          {stageLabel(stageOption)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="candidate-resume">{t("uploadResumePdf")}</Label>
                <Input
                  id="candidate-resume"
                  type="file"
                  accept="application/pdf"
                  onChange={handleResumeUpload}
                />
                {resumeFileName && (
                  <p className="text-xs subtle-text">
                    {isConverting
                      ? t("convertingPdfPreview")
                      : resumeFileName}
                  </p>
                )}
                {resumeError && (
                  <p className="text-xs text-red-500">{resumeError}</p>
                )}
              </div>
              {saveError && (
                <p className="text-sm text-red-500">{saveError}</p>
              )}
              {saveStatus && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span className="mr-2 inline-flex h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground align-[-1px]" />
                  {saveStatus}
                </div>
              )}
            </div>
            <div className="muted-panel min-h-0 min-w-0 p-4 xl:ml-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("resumePreview")}
                </h3>
                {resumePreview && (
                  <button className="text-xs font-medium text-foreground underline-offset-4 hover:underline">
                    {t("viewFull")}
                  </button>
                )}
              </div>
              <div className="mt-3 flex min-h-[360px] items-center justify-center xl:h-[60vh] xl:max-h-[620px]">
                {resumePreview ? (
                  <div className="flex h-[330px] max-h-full w-auto min-w-0 justify-center rounded-sm bg-white xl:h-full">
                    <img
                      src={resumePreview}
                      alt={t("resumePreview")}
                      className="aspect-[210/297] h-full max-h-full w-auto max-w-full rounded-sm border border-border/60 object-contain shadow-sm"
                    />
                  </div>
                ) : (
                  <span className="flex aspect-[210/297] h-[320px] max-h-full w-auto max-w-full items-center justify-center rounded-sm border border-dashed border-border px-5 text-center text-xs subtle-text xl:h-full">
                    {t("uploadPdfPreview")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
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
              onClick={handleSaveCandidate}
              disabled={
                isSaving ||
                !fullName ||
                !jobTitle ||
                isConverting
              }
            >
              {isSaving ? saveStatus ?? t("saving") : t("saveCandidate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters Bar */}
      <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("searchCandidates")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-input-background px-3 py-2 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="min-w-[220px]">
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("filterByJob")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allJobs")}</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.title}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <span className="whitespace-nowrap text-sm font-medium text-foreground">{t("minAiScore")}: {filterScore}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={filterScore}
            onChange={(e) => setFilterScore(Number(e.target.value))}
            className="h-3 w-32 cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
          />
        </div>
      </div>

      {isLoadingCandidates ? (
        <div className="surface-card flex items-center justify-center border-dashed py-16 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            {t("loadingCandidates")}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredApplicants.map((applicant) => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              onDelete={handleDeleteApplicant}
            />
          ))}
        </div>
      )}
      
      {!isLoadingCandidates && filteredApplicants.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("noApplicants")}</p>
        </div>
      )}
    </div>
  );
}
