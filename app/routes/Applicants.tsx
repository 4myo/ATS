import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { Applicant, Stage } from "../store";
import { ApplicantCard } from "../components/ApplicantCard";
import { ChevronLeft, ChevronRight, FileText, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
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
import {
  getCandidateListCache,
  setCandidateListCache,
  updateCachedApplicants,
} from "../lib/candidateListCache";
import { dedupeCandidateRows } from "../lib/candidateRows";
import { enqueueAiAnalysisRetry } from "../lib/aiAnalysisQueue";

type ResumeImportItem = {
  id: string;
  file: File;
  fileName: string;
  candidateName: string;
  text: string;
  previewUrl: string | null;
  isProcessing: boolean;
  error: string | null;
};

const candidateSelect =
  "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_path, resume_preview_url, analysis_summary, analysis_strengths, analysis_concerns, skill_profile, analysis_status, created_at";

const candidateSelectWithOffer =
  `${candidateSelect}, offer_checklist, offer_sent_at, offer_follow_up_at`;

const applicantsPerPage = 12;

const candidateNameFromFileName = (fileName: string) => {
  const withoutExtension = fileName.replace(/\.pdf$/i, "");
  const withoutCvWords = withoutExtension
    .replace(/\b(cv|resume|curriculum|vitae)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutCvWords
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const candidateNameFromText = (text: string, fileName: string) => {
  const fallback = candidateNameFromFileName(fileName);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const candidateLine = lines.find((line) => {
    const cleaned = line.replace(/[^\p{L}\s.'-]/gu, "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    const lower = cleaned.toLowerCase();

    return (
      words.length >= 2 &&
      words.length <= 4 &&
      !lower.includes("email") &&
      !lower.includes("phone") &&
      !lower.includes("linkedin") &&
      !lower.includes("curriculum") &&
      !lower.includes("resume")
    );
  });

  return candidateLine?.replace(/[^\p{L}\s.'-]/gu, "").trim() || fallback;
};

export default function Applicants() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cachedCandidateList = getCandidateListCache();
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; description?: string | null }>
  >(cachedCandidateList?.jobs ?? []);
  const [remoteApplicants, setRemoteApplicants] = useState<Applicant[]>(
    cachedCandidateList?.applicants ?? [],
  );
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(
    !cachedCandidateList,
  );
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("newest");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilters, setStatusFilters] = useState({
    new: false,
    rejected: false,
    accepted: false,
  });
  const [offerStatusFilters, setOfferStatusFilters] = useState({
    preparing: false,
    sent: false,
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [resumeItems, setResumeItems] = useState<ResumeImportItem[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobTitle, setJobTitle] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [applicantPage, setApplicantPage] = useState(1);

  const mapCandidateRow = (row: Record<string, any>) => {
    const skillProfile = row.skill_profile as Record<string, number> | undefined;
    const offerChecklist = row.offer_checklist as Record<string, boolean> | undefined;

    return {
      id: row.id,
      name: row.full_name,
      role: row.job_title,
      stage: (row.stage as Stage) ?? "Applied",
      analysisStatus: row.analysis_status ?? "pending_ai",
      createdAt: row.created_at,
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
      offerChecklist: offerChecklist
        ? {
            offerSent: Boolean(offerChecklist.offerSent),
          }
        : undefined,
      offerSentAt: row.offer_sent_at ?? null,
      offerFollowUpAt: row.offer_follow_up_at ?? null,
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

  const loadCandidates = useCallback(async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading) {
      setIsLoadingCandidates(true);
    }

    const [candidateResult, { data: jobRows, error: jobError }] =
      await Promise.all([
        supabase
          .from("candidates")
          .select(candidateSelectWithOffer)
          .order("created_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("id, title, description")
          .order("created_at", { ascending: false }),
      ]);

    let candidateRows = candidateResult.data as Array<Record<string, any>> | null;
    let candidateError = candidateResult.error;

    if (
      candidateError &&
      (candidateError.message?.includes("offer_") ||
        candidateError.details?.includes("offer_"))
    ) {
      const retry = await supabase
        .from("candidates")
        .select(candidateSelect)
        .order("created_at", { ascending: false });

      candidateRows = retry.data as Array<Record<string, any>> | null;
      candidateError = retry.error;
    }

    if (candidateError || jobError) {
      setRemoteApplicants([]);
      setJobs([]);
      setIsLoadingCandidates(false);
      return;
    }

    const nextApplicants = dedupeCandidateRows(candidateRows ?? []).map(mapCandidateRow);
    const nextJobs = (jobRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
    }));

    setRemoteApplicants(nextApplicants);
    setJobs(nextJobs);
    setCandidateListCache({ applicants: nextApplicants, jobs: nextJobs });
    setIsLoadingCandidates(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadIfMounted = async () => {
      await loadCandidates({ showLoading: !getCandidateListCache() });
      if (!isMounted) return;
    };

    loadIfMounted();

    return () => {
      isMounted = false;
    };
  }, [loadCandidates]);

  const processResumeItem = async (itemId: string, file: File) => {
    let previewUrl: string | null = null;
    let normalizedText = "";
    let error: string | null = null;

    try {
      const [conversion, extractedText] = await Promise.all([
        convertPdfToImage(file),
        extractPdfText(file).catch(() => ""),
      ]);

      previewUrl = conversion.imageUrl || null;
      normalizedText = extractedText.trim() ? extractedText : conversion.ocrText ?? "";
      error = conversion.error ?? null;
    } catch (processingError) {
      error =
        processingError instanceof Error
          ? processingError.message
          : t("previewFailed");
    }

    setResumeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              candidateName: candidateNameFromText(normalizedText, file.name),
              text: normalizedText,
              previewUrl,
              isProcessing: false,
              error,
            }
          : item,
      ),
    );
  };

  const addResumeFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));

    if (files.length === 0) {
      setResumeError(t("resumePdfOnly"));
      return;
    }

    setResumeError(null);

    const nextItems: ResumeImportItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      candidateName: candidateNameFromFileName(file.name),
      text: "",
      previewUrl: null,
      isProcessing: true,
      error: null,
    }));

    setResumeItems((prev) => [...prev, ...nextItems]);
    setSelectedResumeId((current) => current ?? nextItems[0]?.id ?? null);
    void (async () => {
      for (const item of nextItems) {
        await processResumeItem(item.id, item.file);
      }
    })();
  };

  const handleResumeUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      addResumeFiles(event.target.files);
    }
    event.target.value = "";
  };

  const handleDropResume = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingResume(false);
    if (event.dataTransfer.files.length) {
      addResumeFiles(event.dataTransfer.files);
    }
  };

  const updateResumeCandidateName = (itemId: string, candidateName: string) => {
    setResumeItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, candidateName } : item)),
    );
  };

  const removeResumeItem = (itemId: string) => {
    setResumeItems((prev) => {
      const next = prev.filter((item) => item.id !== itemId);
      setSelectedResumeId((current) =>
        current === itemId ? next[0]?.id ?? null : current,
      );
      return next;
    });
  };

  const resetForm = () => {
    setSelectedJobId("");
    setJobTitle("");
    setJobDescription("");
    setResumeItems([]);
    setSelectedResumeId(null);
    setIsDraggingResume(false);
    setResumeError(null);
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
      updateCachedApplicants((applicants) =>
        applicants.filter((applicant) => applicant.id !== id),
      );
    }
  };

  const handleMarkNewReviewed = async (id: string) => {
    const nextStage: Stage = "Screening";
    const previousApplicants = remoteApplicants;

    setRemoteApplicants((prev) =>
      prev.map((applicant) =>
        applicant.id === id ? { ...applicant, stage: nextStage } : applicant,
      ),
    );
    updateCachedApplicants((applicants) =>
      applicants.map((applicant) =>
        applicant.id === id ? { ...applicant, stage: nextStage } : applicant,
      ),
    );

    const { error } = await supabase
      .from("candidates")
      .update({ stage: nextStage })
      .eq("id", id);

    if (error) {
      setRemoteApplicants(previousApplicants);
      setCandidateListCache({ applicants: previousApplicants, jobs });
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

      let latestJobTitle = jobTitle;
      let latestJobDescription = jobDescription;

      if (selectedJobId) {
        const { data: latestJob, error: latestJobError } = await supabase
          .from("jobs")
          .select("title, description")
          .eq("id", selectedJobId)
          .single();

        if (latestJobError) {
          throw latestJobError;
        }

        latestJobTitle = latestJob?.title ?? jobTitle;
        latestJobDescription = latestJob?.description ?? "";
        setJobTitle(latestJobTitle);
        setJobDescription(latestJobDescription);
      }

      const readyItems = resumeItems.filter(
        (item) => !item.isProcessing && item.candidateName.trim() && !item.error,
      );

      if (readyItems.length === 0) {
        throw new Error(t("resumeImportMissing"));
      }

      const failedImports: string[] = [];
      const queuedAnalyses: string[] = [];
      const savedItemIds: string[] = [];

      for (const [index, item] of readyItems.entries()) {
        try {
          setSaveStatus(`${t("uploadingResume")} ${index + 1}/${readyItems.length}`);

          let normalizedResumeText = item.text;
          if (!normalizedResumeText.trim()) {
            normalizedResumeText = await extractPdfText(item.file);
          }

          if (!normalizedResumeText.trim()) {
            throw new Error(t("resumeExtractFailed"));
          }

          const fileExt = item.file.name.split(".").pop() || "pdf";
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          const filePath = `${sessionData.session.user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("resumes")
            .upload(filePath, item.file, { upsert: false });

          if (uploadError) {
            throw uploadError;
          }

          setSaveStatus(`${t("savingCandidateProfile")} ${index + 1}/${readyItems.length}`);
          const { data: inserted, error: insertError } = await supabase
            .from("candidates")
            .insert({
              user_id: sessionData.session.user.id,
              full_name: item.candidateName.trim(),
              job_title: latestJobTitle,
              stage: "Applied",
              resume_path: filePath,
              resume_preview_url: item.previewUrl,
              analysis_status: "pending_ai",
            })
            .select("id")
            .single();

          if (insertError) {
            throw insertError;
          }

          if (inserted?.id) {
            savedItemIds.push(item.id);
            setRemoteApplicants((prev) => [
              {
                id: inserted.id,
                name: item.candidateName.trim(),
                role: latestJobTitle,
                stage: "Applied",
                analysisStatus: "pending_ai",
                createdAt: new Date().toISOString(),
                aiScore: 0,
                skills: [],
                experience: 0,
                location: "Location pending",
                avatar: item.previewUrl ?? "",
                email: "",
                phone: "",
                summary: "",
                matchAnalysis: { pros: [], cons: [] },
              },
              ...prev,
            ]);
            updateCachedApplicants((applicants) => [
              {
                id: inserted.id,
                name: item.candidateName.trim(),
                role: latestJobTitle,
                stage: "Applied",
                analysisStatus: "pending_ai",
                createdAt: new Date().toISOString(),
                aiScore: 0,
                skills: [],
                experience: 0,
                location: "Location pending",
                avatar: item.previewUrl ?? "",
                email: "",
                phone: "",
                summary: "",
                matchAnalysis: { pros: [], cons: [] },
              },
              ...applicants,
            ]);

            setSaveStatus(`${t("runningAiAnalysis")} ${index + 1}/${readyItems.length}`);

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
              jobTitle: latestJobTitle,
              jobDescription: latestJobDescription,
              resumeText: normalizedResumeText,
              }),
            });

            if (!analysisResponse.ok) {
              const analysisMessage = await analysisResponse.text();
              await supabase
                .from("candidates")
                .update({ analysis_status: "pending_ai" })
                .eq("id", inserted.id);

              enqueueAiAnalysisRetry({
                candidateId: inserted.id,
                candidateName: item.candidateName.trim(),
                jobTitle: latestJobTitle,
                jobDescription: latestJobDescription,
                resumeText: normalizedResumeText,
                lastError: analysisMessage || analysisResponse.statusText,
              });
              queuedAnalyses.push(item.candidateName.trim());
            }
          }
        } catch (importError) {
          const message =
            importError instanceof Error ? importError.message : t("failedCandidateSave");
          failedImports.push(`${item.candidateName || item.fileName}: ${message}`);
        }
      }

      await loadCandidates();
      if (failedImports.length > 0) {
        setResumeItems((currentItems) =>
          currentItems.filter((item) => !savedItemIds.includes(item.id)),
        );
        setSelectedResumeId((currentId) =>
          currentId && savedItemIds.includes(currentId) ? null : currentId,
        );
        setSaveError(`${t("resumeImportPartialFailure")} ${failedImports.join(" | ")}`);
      } else if (queuedAnalyses.length > 0) {
        resetForm();
        setIsAddOpen(false);
      } else {
        resetForm();
        setIsAddOpen(false);
      }
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

  const toggleStatusFilter = (filter: keyof typeof statusFilters, checked: boolean) => {
    setStatusFilters((current) => ({
      ...current,
      [filter]: checked,
    }));
  };

  const toggleOfferStatusFilter = (
    filter: keyof typeof offerStatusFilters,
    checked: boolean,
  ) => {
    setOfferStatusFilters((current) => ({
      ...current,
      [filter]: checked,
    }));
  };

  const matchesStatusFilters = (applicant: Applicant) => {
    const hasActiveStatusFilter = Object.values(statusFilters).some(Boolean);
    if (!hasActiveStatusFilter) return true;

    return (
      (statusFilters.new && applicant.stage === "Applied") ||
      (statusFilters.rejected && applicant.stage === "Rejected") ||
      (statusFilters.accepted && applicant.stage === "Offer")
    );
  };

  const matchesOfferStatusFilters = (applicant: Applicant) => {
    const hasActiveOfferFilter = Object.values(offerStatusFilters).some(Boolean);
    if (!hasActiveOfferFilter) return true;
    if (applicant.stage !== "Offer") return false;

    const offerSent = Boolean(applicant.offerChecklist?.offerSent);
    return (
      (offerStatusFilters.preparing && !offerSent) ||
      (offerStatusFilters.sent && offerSent)
    );
  };

  const filteredApplicants = remoteApplicants
    .filter((applicant) => matchesStatusFilters(applicant))
    .filter((applicant) => matchesOfferStatusFilters(applicant))
    .filter((applicant) => jobFilter === "all" || applicant.role === jobFilter)
    .sort((left, right) => {
      if (ratingFilter === "highest") {
        return (right.aiScore ?? 0) - (left.aiScore ?? 0);
      }

      if (ratingFilter === "lowest") {
        return (left.aiScore ?? 0) - (right.aiScore ?? 0);
      }

      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;

      return sortOrder === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

  const applicantPageCount = Math.max(
    1,
    Math.ceil(filteredApplicants.length / applicantsPerPage),
  );
  const paginatedApplicants = filteredApplicants.slice(
    (applicantPage - 1) * applicantsPerPage,
    applicantPage * applicantsPerPage,
  );

  useEffect(() => {
    setApplicantPage(1);
  }, [ratingFilter, sortOrder, jobFilter, statusFilters, offerStatusFilters]);

  useEffect(() => {
    setApplicantPage((page) => Math.min(page, applicantPageCount));
  }, [applicantPageCount]);

  const selectedResume =
    resumeItems.find((item) => item.id === selectedResumeId) ?? resumeItems[0] ?? null;
  const isProcessingResumes = resumeItems.some((item) => item.isProcessing);
  const canSaveCandidates =
    !isSaving &&
    Boolean(selectedJobId) &&
    resumeItems.length > 0 &&
    !isProcessingResumes &&
    resumeItems.some((item) => item.candidateName.trim() && !item.error);

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
        <DialogContent className="grid max-h-[94vh] w-[min(1240px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-border bg-card p-4 text-card-foreground sm:max-w-none sm:p-5">
          <DialogHeader>
            <DialogTitle>{t("addCandidate")}</DialogTitle>
            <DialogDescription>
              {t("addCandidateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 gap-6 overflow-y-auto pr-1 2xl:grid-cols-[minmax(420px,440px)_minmax(0,1fr)] 2xl:gap-8 2xl:overflow-hidden 2xl:pr-0">
            <div className="grid min-w-0 content-start gap-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor="candidate-role">{t("jobTitle")}</Label>
                <Select
                  value={selectedJobId}
                  onValueChange={(value) => {
                    setSelectedJobId(value);
                    const selectedJob = jobs.find((job) => job.id === value);
                    setJobTitle(selectedJob?.title ?? "");
                    setJobDescription(selectedJob?.description ?? "");
                  }}
                >
                  <SelectTrigger
                    id="candidate-role"
                    className="min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
                  >
                    <SelectValue placeholder={t("selectJob")} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("uploadResumePdf")}</Label>
                <input
                  ref={fileInputRef}
                  id="candidate-resume"
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleResumeUpload}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(false);
                  }}
                  onDrop={handleDropResume}
                  className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
                    isDraggingResume
                      ? "border-ring bg-muted"
                      : "border-border bg-input-background hover:border-ring hover:bg-muted/60"
                  }`}
                >
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">{t("dropResumeHere")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("dropResumeHint")}</p>
                </div>
                {resumeError ? <p className="text-xs text-red-500">{resumeError}</p> : null}
              </div>

              {resumeItems.length > 0 ? (
                <div className="grid gap-2">
                  <Label>{t("selectedResumes")}</Label>
                  <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {resumeItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md border p-3 ${
                          selectedResume?.id === item.id
                            ? "border-ring bg-muted/50"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedResumeId(item.id)}
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.fileName}</span>
                          </button>
                          <button
                            type="button"
                            className="rounded-full p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            onClick={() => removeResumeItem(item.id)}
                            aria-label={t("removeResume")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <Input
                          value={item.candidateName}
                          placeholder={t("candidateNamePlaceholder")}
                          onFocus={() => setSelectedResumeId(item.id)}
                          onChange={(event) =>
                            updateResumeCandidateName(item.id, event.target.value)
                          }
                        />
                        {item.isProcessing ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("convertingPdfPreview")}
                          </p>
                        ) : null}
                        {item.error ? (
                          <p className="mt-2 text-xs text-red-500">{item.error}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t("candidateStageAppliedNote")}
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
            <div className="muted-panel min-h-0 min-w-0 p-4 2xl:ml-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("resumePreview")}
                </h3>
                {selectedResume ? (
                  <span className="max-w-[220px] truncate text-xs font-medium text-muted-foreground">
                    {selectedResume.fileName}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex min-h-[360px] items-center justify-center 2xl:h-[60vh] 2xl:max-h-[620px]">
                {selectedResume?.previewUrl ? (
                  <div className="flex h-[330px] max-h-full w-auto min-w-0 justify-center rounded-sm bg-white 2xl:h-full">
                    <img
                      src={selectedResume.previewUrl}
                      alt={t("resumePreview")}
                      className="aspect-[210/297] h-full max-h-full w-auto max-w-full rounded-sm border border-border/60 object-contain shadow-sm"
                    />
                  </div>
                ) : selectedResume?.isProcessing ? (
                  <div className="flex h-[320px] max-h-full w-full items-center justify-center rounded-sm border border-dashed border-border px-5 text-center text-xs subtle-text 2xl:h-full">
                    <span className="mr-2 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    {t("convertingPdfPreview")}
                  </div>
                ) : (
                  <span className="flex aspect-[210/297] h-[320px] max-h-full w-auto max-w-full items-center justify-center rounded-sm border border-dashed border-border px-5 text-center text-xs subtle-text 2xl:h-full">
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
              disabled={!canSaveCandidates}
            >
              {isSaving ? saveStatus ?? t("saving") : t("importCandidates")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters Bar */}
      <div className="surface-card ml-0 flex flex-wrap items-end gap-3 p-3 sm:ml-2">
        <div className="grid min-w-[180px] flex-1 gap-1.5 sm:flex-none sm:basis-[190px]">
          <Label>{t("filterByRating")}</Label>
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
              <SelectValue placeholder={t("filterByRating")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allRatings")}</SelectItem>
              <SelectItem value="highest">{t("highestRating")}</SelectItem>
              <SelectItem value="lowest">{t("lowestRating")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-[180px] flex-1 gap-1.5 sm:flex-none sm:basis-[190px]">
          <Label>{t("timeline")}</Label>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
              <SelectValue placeholder={t("timeline")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("newestFirst")}</SelectItem>
              <SelectItem value="oldest">{t("oldestFirst")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-[220px] flex-[1.25] gap-1.5 sm:flex-none sm:basis-[260px] lg:basis-[300px]">
          <Label>{t("filterByJob")}</Label>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
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
        <div className="grid min-w-[300px] flex-[1.5] gap-1.5">
          <Label>{t("statusFilters")}</Label>
          <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-background px-3 py-2 shadow-sm dark:bg-muted/30">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={statusFilters.new}
                onCheckedChange={(checked) =>
                  toggleStatusFilter("new", checked === true)
                }
              />
              {t("newApplicantBadge")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={statusFilters.rejected}
                onCheckedChange={(checked) =>
                  toggleStatusFilter("rejected", checked === true)
                }
              />
              {t("rejectedStatusFilter")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={statusFilters.accepted}
                onCheckedChange={(checked) =>
                  toggleStatusFilter("accepted", checked === true)
                }
              />
              {t("acceptedStatusFilter")}
            </label>
          </div>
        </div>
        <div className="grid min-w-[260px] flex-1 gap-1.5 sm:flex-none sm:basis-[280px]">
          <Label>{t("offerStatusFilters")}</Label>
          <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-background px-3 py-2 shadow-sm dark:bg-muted/30">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={offerStatusFilters.preparing}
                onCheckedChange={(checked) =>
                  toggleOfferStatusFilter("preparing", checked === true)
                }
              />
              {t("offerStatusPreparing")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={offerStatusFilters.sent}
                onCheckedChange={(checked) =>
                  toggleOfferStatusFilter("sent", checked === true)
                }
              />
              {t("offerStatusSent")}
            </label>
          </div>
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
          {paginatedApplicants.map((applicant) => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              onDelete={handleDeleteApplicant}
              onMarkNewReviewed={handleMarkNewReviewed}
            />
          ))}
        </div>
      )}

      {!isLoadingCandidates && filteredApplicants.length > applicantsPerPage && (
        <div className="flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setApplicantPage((page) => Math.max(page - 1, 1))}
              disabled={applicantPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-16 px-2 text-center text-xs font-medium text-muted-foreground">
              {applicantPage} / {applicantPageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setApplicantPage((page) => Math.min(page + 1, applicantPageCount))
              }
              disabled={applicantPage === applicantPageCount}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
