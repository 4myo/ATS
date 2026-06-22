import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { clsx } from "clsx";
import type { Applicant, Stage } from "../store";
import { ApplicantCard } from "../components/ApplicantCard";
import { ApplicantWorkTable } from "../components/ApplicantWorkTable";
import { CandidateComparisonDialog } from "../components/CandidateComparisonDialog";
import { ScoreChip } from "../components/ScoreChip";
import { useConfirm } from "../lib/confirm";
import { Check, ChevronDown, ChevronLeft, ChevronRight, FileText, SlidersHorizontal, Upload, X } from "lucide-react";
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
import { ListReportShell, type StatusTab } from "../components/shell/ListReportShell";
import { StatStrip } from "../components/shell/StatStrip";
import { convertPdfToImage, extractPdfText } from "../lib/pdf";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import {
  getCandidateListCache,
  setCandidateListCache,
  updateCachedApplicants,
} from "../lib/candidateListCache";
import { fetchJobOptions, getCachedJobOptions, setCachedJobOptions } from "../lib/jobCache";
import { dedupeCandidateRows } from "../lib/candidateRows";
import { enqueueAiAnalysisRetry } from "../lib/aiAnalysisQueue";
import { logActivityEvent } from "../lib/activityLog";
import { matchesCandidateSearch } from "../lib/candidateIdentity";
import {
  finishCandidateImportProgress,
  startCandidateImportProgress,
  updateCandidateImportProgress,
} from "../lib/importProgress";

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

type CandidateImportDraft = {
  isOpen: boolean;
  step: number;
  resumeItems: ResumeImportItem[];
  selectedResumeId: string | null;
  resumeError: string | null;
  selectedJobId: string;
  jobTitle: string;
  jobDescription: string;
  saveError: string | null;
};

let candidateImportDraft: CandidateImportDraft | null = null;

const applicantsViewStorageKey = "smart-ats-applicants-view-state";

const defaultStatusFilters = {
  new: false,
};

const defaultOfferStatusFilters = {
  offer: false,
  preparing: false,
  sent: false,
  accepted: false,
  declined: false,
};

type ApplicantsViewState = {
  ratingFilter: string;
  searchFilter: string;
  sortOrder: string;
  jobFilter: string;
  jobStatusFilter: string;
  statusFilters: typeof defaultStatusFilters;
  offerStatusFilters: typeof defaultOfferStatusFilters;
  applicantPage: number;
};

const readApplicantsViewState = (): Partial<ApplicantsViewState> | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(applicantsViewStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveApplicantsViewState = (state: ApplicantsViewState) => {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(applicantsViewStorageKey, JSON.stringify(state));
};

const candidateSelect =
  // analysis_strengths/analysis_concerns are encrypted and not shown in the list
  // (ApplicantCard doesn't use them; detail re-fetches) — kept out to avoid
  // decrypting them per row. analysis_summary stays: it feeds candidate search.
  "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_path, resume_preview_url, analysis_summary, skill_profile, analysis_status, created_at";

const candidateSelectWithOffer =
  `${candidateSelect}, offer_checklist, offer_outcome, offer_sent_at`;

const applicantsPerPage = 12;
const candidateImportSteps = ["Pozicija", "Življenjepis", "Pregled"] as const;
const candidateWorkflowPreviewStages: Stage[] = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
];

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
  const { t, tt, stageLabel } = useI18n();
  const confirm = useConfirm();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoredViewState = useMemo(() => readApplicantsViewState(), []);
  const didMountFilterResetRef = useRef(false);
  const cachedCandidateList = getCandidateListCache();
  const cachedJobOptions = getCachedJobOptions();
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; description?: string | null; status?: string | null }>
  >(cachedCandidateList?.jobs ?? cachedJobOptions?.jobs ?? []);
  const [remoteApplicants, setRemoteApplicants] = useState<Applicant[]>(
    cachedCandidateList?.applicants ?? [],
  );
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(
    !cachedCandidateList,
  );
  const [ratingFilter, setRatingFilter] = useState<string>(
    restoredViewState?.ratingFilter ?? "all",
  );
  const [searchFilter, setSearchFilter] = useState<string>(
    searchParams.get("search") ?? restoredViewState?.searchFilter ?? "",
  );
  const [isApplicantSearchOpen, setIsApplicantSearchOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<string>(
    restoredViewState?.sortOrder ?? "newest",
  );
  const [jobFilter, setJobFilter] = useState<string>(
    restoredViewState?.jobFilter ?? "all",
  );
  const [jobStatusFilter, setJobStatusFilter] = useState<string>(
    restoredViewState?.jobStatusFilter ?? "all",
  );
  const [stageTab, setStageTab] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [statusFilters, setStatusFilters] = useState({
    ...defaultStatusFilters,
    ...(restoredViewState?.statusFilters ?? {}),
  });
  const [offerStatusFilters, setOfferStatusFilters] = useState({
    ...defaultOfferStatusFilters,
    ...(restoredViewState?.offerStatusFilters ?? {}),
  });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<Set<string>>(new Set());
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
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
  const [applicantPage, setApplicantPage] = useState(
    restoredViewState?.applicantPage ?? 1,
  );
  const currentApplicantsPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!candidateImportDraft) return;

    setIsAddOpen(candidateImportDraft.isOpen);
    setImportStep(candidateImportDraft.step || 1);
    setResumeItems(candidateImportDraft.resumeItems);
    setSelectedResumeId(candidateImportDraft.selectedResumeId);
    setResumeError(candidateImportDraft.resumeError);
    setSelectedJobId(candidateImportDraft.selectedJobId);
    setJobTitle(candidateImportDraft.jobTitle);
    setJobDescription(candidateImportDraft.jobDescription);
    setSaveError(candidateImportDraft.saveError);
  }, []);

  useEffect(() => {
    if (
      !isAddOpen &&
      resumeItems.length === 0 &&
      !selectedJobId &&
      !jobTitle &&
      !jobDescription &&
      !resumeError &&
      !saveError
    ) {
      candidateImportDraft = null;
      return;
    }

    candidateImportDraft = {
      isOpen: isAddOpen,
      step: importStep,
      resumeItems,
      selectedResumeId,
      resumeError,
      selectedJobId,
      jobTitle,
      jobDescription,
      saveError,
    };
  }, [
    isAddOpen,
    importStep,
    jobDescription,
    jobTitle,
    resumeError,
    resumeItems,
    saveError,
    selectedJobId,
    selectedResumeId,
  ]);

  useEffect(() => {
    const searchFromUrl = searchParams.get("search");
    if (searchFromUrl !== null) {
      setSearchFilter(searchFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("add") === "1") setIsAddOpen(true);
  }, [searchParams]);

  useEffect(() => {
    saveApplicantsViewState({
      ratingFilter,
      searchFilter,
      sortOrder,
      jobFilter,
      jobStatusFilter,
      statusFilters,
      offerStatusFilters,
      applicantPage,
    });
  }, [
    applicantPage,
    jobFilter,
    jobStatusFilter,
    offerStatusFilters,
    ratingFilter,
    searchFilter,
    sortOrder,
    statusFilters,
  ]);

  const mapCandidateRow = (row: Record<string, any>) => {
    const skillProfile = row.skill_profile as Record<string, number> | undefined;
    const offerChecklist = row.offer_checklist as Record<string, boolean> | undefined;

    return {
      id: row.id,
      name: row.full_name,
      role: row.job_title,
      stage: (row.stage as Stage) ?? "Applied",
      analysisStatus: row.analysis_status ?? null,
      createdAt: row.created_at,
      aiScore: row.ats_score ?? null,
      skills: row.skills ?? [],
      experience: Number(row.years_experience ?? 0),
      location: row.location ?? "",
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
      offerOutcome: row.offer_outcome ?? null,
      offerSentAt: row.offer_sent_at ?? null,
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

    const [candidateResult, jobResult] =
      await Promise.allSettled([
        supabase
          .from("candidates_secure")
          .select(candidateSelectWithOffer)
          .order("created_at", { ascending: false }),
        fetchJobOptions({ force: true }),
      ]);

    if (candidateResult.status === "rejected") {
      setRemoteApplicants([]);
      setIsLoadingCandidates(false);
      return;
    }

    let candidateRows = candidateResult.value.data as Array<Record<string, any>> | null;
    let candidateError = candidateResult.value.error;

    if (
      candidateError &&
      (candidateError.message?.includes("offer_") ||
        candidateError.details?.includes("offer_"))
    ) {
      const retry = await supabase
        .from("candidates_secure")
        .select(candidateSelect)
        .order("created_at", { ascending: false });

      candidateRows = retry.data as Array<Record<string, any>> | null;
      candidateError = retry.error;
    }

    if (candidateError) {
      setRemoteApplicants([]);
      setIsLoadingCandidates(false);
      return;
    }

    const nextApplicants = dedupeCandidateRows(candidateRows ?? []).map(mapCandidateRow);
    const nextJobs =
      jobResult.status === "fulfilled"
        ? jobResult.value
        : getCachedJobOptions()?.jobs ?? getCandidateListCache()?.jobs ?? [];

    setRemoteApplicants(nextApplicants);
    setJobs(nextJobs);
    setCachedJobOptions(nextJobs);
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
    setImportStep(1);
    setSelectedJobId("");
    setJobTitle("");
    setJobDescription("");
    setResumeItems([]);
    setSelectedResumeId(null);
    setIsDraggingResume(false);
    setResumeError(null);
    setSaveError(null);
    setSaveStatus(null);
    candidateImportDraft = null;
  };

  const preserveImportDraft = () => {
    candidateImportDraft = {
      isOpen: true,
      step: importStep,
      resumeItems,
      selectedResumeId,
      resumeError,
      selectedJobId,
      jobTitle,
      jobDescription,
      saveError,
    };
  };

  const handleDeleteApplicant = async (id: string) => {
    const applicant = remoteApplicants.find((item) => item.id === id);
    const confirmed = await confirm({
      description: t("deleteApplicantConfirm"),
      confirmLabel: t("deleteApplicant"),
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (!error) {
      setRemoteApplicants((prev) => prev.filter((app) => app.id !== id));
      updateCachedApplicants((applicants) =>
        applicants.filter((applicant) => applicant.id !== id),
      );
      void logActivityEvent({
        action: "candidate_deleted",
        entityType: "candidate",
        entityId: id,
        entityLabel: applicant?.name ?? "Kandidat",
        metadata: { job_title: applicant?.role, stage: applicant?.stage },
      });
    }
  };

  const handleMarkNewReviewed = async (id: string) => {
    const nextStage: Stage = "Screening";
    const previousApplicants = remoteApplicants;
    const applicant = remoteApplicants.find((item) => item.id === id);

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
    } else {
      void logActivityEvent({
        action: "candidate_stage_changed",
        entityType: "candidate",
        entityId: id,
        entityLabel: applicant?.name ?? "Kandidat",
        fromValue: "Applied",
        toValue: nextStage,
        metadata: { job_title: applicant?.role },
      });
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

      startCandidateImportProgress(readyItems.length);
      setIsAddOpen(false);

      const failedImports: string[] = [];
      const queuedAnalyses: string[] = [];
      const savedItemIds: string[] = [];

      for (const [index, item] of readyItems.entries()) {
        try {
          setSaveStatus(`${t("uploadingResume")} ${index + 1}/${readyItems.length}`);
          updateCandidateImportProgress({
            currentLabel: item.candidateName.trim() || item.fileName,
            message: `${t("uploadingResume")} ${index + 1}/${readyItems.length}`,
          });

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
            void logActivityEvent({
              action: "candidate_created",
              entityType: "candidate",
              entityId: inserted.id,
              entityLabel: item.candidateName.trim(),
              toValue: "Applied",
              metadata: {
                job_id: selectedJobId || null,
                job_title: latestJobTitle,
                import_batch_size: readyItems.length,
              },
            });
            setRemoteApplicants((prev) => [
              {
                id: inserted.id,
                name: item.candidateName.trim(),
                role: latestJobTitle,
                stage: "Applied",
                analysisStatus: "pending_ai",
                createdAt: new Date().toISOString(),
                aiScore: null,
                skills: [],
                experience: 0,
                location: "",
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
                aiScore: null,
                skills: [],
                experience: 0,
                location: "",
                avatar: item.previewUrl ?? "",
                email: "",
                phone: "",
                summary: "",
                matchAnalysis: { pros: [], cons: [] },
              },
              ...applicants,
            ]);

            setSaveStatus(`${t("runningAiAnalysis")} ${index + 1}/${readyItems.length}`);
            updateCandidateImportProgress({
              currentLabel: item.candidateName.trim(),
              message: `${t("runningAiAnalysis")} ${index + 1}/${readyItems.length}`,
            });

            const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`;
            let analysisMessage = "";
            let shouldQueueAnalysis = false;

            try {
              const analysisResponse = await fetch(functionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${sessionData.session.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                  candidateId: inserted.id,
                  jobId: selectedJobId,
                  jobTitle: latestJobTitle,
                  jobDescription: latestJobDescription,
                  resumeText: normalizedResumeText,
                }),
              });

              if (!analysisResponse.ok) {
                analysisMessage = await analysisResponse.text();
                shouldQueueAnalysis = true;
              }
            } catch (analysisError) {
              analysisMessage =
                analysisError instanceof Error
                  ? analysisError.message
                  : t("analysisQueuedForRetry");
              shouldQueueAnalysis = true;
            }

            if (shouldQueueAnalysis) {
              await supabase
                .from("candidates")
                .update({ analysis_status: "pending_ai" })
                .eq("id", inserted.id);

              enqueueAiAnalysisRetry({
                candidateId: inserted.id,
                candidateName: item.candidateName.trim(),
                jobId: selectedJobId,
                jobTitle: latestJobTitle,
                jobDescription: latestJobDescription,
                resumeText: normalizedResumeText,
                lastError: analysisMessage || t("analysisQueuedForRetry"),
              });
              queuedAnalyses.push(item.candidateName.trim());
              updateCandidateImportProgress({
                queued: queuedAnalyses.length,
              });
            }
          }
          updateCandidateImportProgress({
            completed: index + 1,
            failed: failedImports.length,
            queued: queuedAnalyses.length,
            message: `${index + 1}/${readyItems.length} kandidatov obdelanih`,
          });
        } catch (importError) {
          const message =
            importError instanceof Error ? importError.message : t("failedCandidateSave");
          failedImports.push(`${item.candidateName || item.fileName}: ${message}`);
          updateCandidateImportProgress({
            completed: index + 1,
            failed: failedImports.length,
            queued: queuedAnalyses.length,
            currentLabel: item.candidateName || item.fileName,
            message,
          });
        }
      }

      await loadCandidates();
      finishCandidateImportProgress({
        completed: readyItems.length,
        failed: failedImports.length,
        queued: queuedAnalyses.length,
        currentLabel: null,
        message:
          failedImports.length > 0
            ? tt("Uvoz končan z napakami.")
            : queuedAnalyses.length > 0
              ? tt("Uvoz končan. Nekateri pregledi čakajo na ponovni poskus.")
              : tt("Uvoz kandidatov končan."),
      });
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
      } else {
        resetForm();
      }
    } catch (error) {
      await loadCandidates();
      const message =
        error instanceof Error ? error.message : t("failedCandidateSave");
      setSaveError(message);
      finishCandidateImportProgress({
        message,
      });
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
      ...(filter === "offer" && !checked
        ? { preparing: false, sent: false, accepted: false, declined: false }
        : {}),
    }));
  };

  const updateSearchFilter = (value: string) => {
    setSearchFilter(value);
    const nextParams = new URLSearchParams(searchParams);

    if (value.trim()) {
      nextParams.set("search", value);
    } else {
      nextParams.delete("search");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const applicantSearchSuggestions = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const source =
      normalizedSearch.length >= 2
        ? remoteApplicants.filter((applicant) => matchesCandidateSearch({
            candidateId: applicant.id,
            query: searchFilter,
            values: [
              applicant.name,
              applicant.role,
              applicant.email,
              applicant.location,
              ...(applicant.skills ?? []),
            ],
          }))
        : remoteApplicants;

    return source
      .slice()
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 6);
  }, [remoteApplicants, searchFilter]);

  const matchesStatusFilters = (applicant: Applicant) => {
    const hasActiveStatusFilter = Object.values(statusFilters).some(Boolean);
    if (!hasActiveStatusFilter) return true;

    return statusFilters.new && applicant.stage === "Applied";
  };

  const matchesOfferStatusFilters = (applicant: Applicant) => {
    const hasActiveOfferFilter = Object.values(offerStatusFilters).some(Boolean);
    if (!hasActiveOfferFilter) return true;

    const offerSent = Boolean(applicant.offerChecklist?.offerSent);
    const outcome = applicant.offerOutcome ?? "pending";
    const hasActiveOfferSubFilter =
      offerStatusFilters.preparing ||
      offerStatusFilters.sent ||
      offerStatusFilters.accepted ||
      offerStatusFilters.declined;

    if (offerStatusFilters.offer && !hasActiveOfferSubFilter) {
      return (
        applicant.stage === "Offer" ||
        applicant.stage === "Accepted" ||
        offerSent
      );
    }

    return (
      (offerStatusFilters.preparing && applicant.stage === "Offer" && !offerSent) ||
      (offerStatusFilters.sent && offerSent && outcome === "pending") ||
      (offerStatusFilters.accepted && outcome === "accepted") ||
      (offerStatusFilters.declined && outcome === "declined")
    );
  };

  const getApplicantJobStatus = (applicant: Applicant) =>
    jobs.find((job) => job.title === applicant.role)?.status ?? "active";

  const matchesJobStatusFilter = (applicant: Applicant) => {
    if (jobStatusFilter === "all") return true;
    return getApplicantJobStatus(applicant) === jobStatusFilter;
  };

  const matchesSearchFilter = (applicant: Applicant) => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    if (!normalizedSearch) return true;

    return matchesCandidateSearch({
      candidateId: applicant.id,
      query: searchFilter,
      values: [applicant.name, applicant.role, applicant.email, applicant.location, applicant.summary, ...(applicant.skills ?? [])],
    });
  };

  // Everything except the stage tab — used both for tab counts and the list.
  const baseFilteredApplicants = remoteApplicants
    .filter((applicant) => matchesSearchFilter(applicant))
    .filter((applicant) => matchesStatusFilters(applicant))
    .filter((applicant) => matchesOfferStatusFilters(applicant))
    .filter((applicant) => matchesJobStatusFilter(applicant))
    .filter((applicant) => jobFilter === "all" || applicant.role === jobFilter);

  const matchesStageTab = (applicant: Applicant) => {
    if (stageTab === "all") return true;
    if (stageTab === "review") return applicant.stage === "Applied" || applicant.stage === "Screening";
    return applicant.stage === stageTab;
  };

  const stageTabs: StatusTab[] = [
    { key: "all", label: tt("Vsi"), count: baseFilteredApplicants.length },
    {
      key: "review",
      label: tt("Za pregled"),
      count: baseFilteredApplicants.filter(
        (a) => a.stage === "Applied" || a.stage === "Screening",
      ).length,
    },
    { key: "Interview", label: stageLabel("Interview"), count: baseFilteredApplicants.filter((a) => a.stage === "Interview").length },
    { key: "Offer", label: stageLabel("Offer"), count: baseFilteredApplicants.filter((a) => a.stage === "Offer").length },
    { key: "Accepted", label: stageLabel("Accepted"), count: baseFilteredApplicants.filter((a) => a.stage === "Accepted").length },
    { key: "Rejected", label: stageLabel("Rejected"), count: baseFilteredApplicants.filter((a) => a.stage === "Rejected").length },
  ];

  const filteredApplicants = baseFilteredApplicants
    .filter(matchesStageTab)
    .sort((left, right) => {
      if (ratingFilter === "highest") {
        return (right.aiScore ?? -1) - (left.aiScore ?? -1);
      }

      if (ratingFilter === "lowest") {
        return (left.aiScore ?? 101) - (right.aiScore ?? 101);
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
  const selectedApplicants = remoteApplicants.filter((applicant) => selectedApplicantIds.has(applicant.id));

  const toggleApplicantSelection = (id: string, selected: boolean) => {
    setSelectedApplicantIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisibleApplicants = (selected: boolean) => {
    setSelectedApplicantIds((current) => {
      const next = new Set(current);
      paginatedApplicants.forEach((applicant) => {
        if (selected) next.add(applicant.id);
        else next.delete(applicant.id);
      });
      return next;
    });
  };

  useEffect(() => {
    if (!didMountFilterResetRef.current) {
      didMountFilterResetRef.current = true;
      return;
    }

    setApplicantPage(1);
  }, [ratingFilter, sortOrder, jobFilter, jobStatusFilter, statusFilters, offerStatusFilters, searchFilter, stageTab]);

  useEffect(() => {
    setApplicantPage((page) => Math.min(page, applicantPageCount));
  }, [applicantPageCount]);

  const selectedResume =
    resumeItems.find((item) => item.id === selectedResumeId) ?? resumeItems[0] ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const isProcessingResumes = resumeItems.some((item) => item.isProcessing);
  const canSaveCandidates =
    !isSaving &&
    Boolean(selectedJobId) &&
    resumeItems.length > 0 &&
    !isProcessingResumes &&
    resumeItems.some((item) => item.candidateName.trim() && !item.error);

  // Advanced (collapsed-by-default) filters live behind the "Napredni filtri"
  // expander; the primary row keeps only search + job (status = stage tabs).
  const advancedActiveCount =
    (ratingFilter !== "all" ? 1 : 0) +
    (jobStatusFilter !== "all" ? 1 : 0) +
    (statusFilters.new ? 1 : 0) +
    (offerStatusFilters.offer ? 1 : 0);

  const offerSubFilterLabels: Record<string, string> = {
    preparing: t("offerStatusPreparing"),
    sent: tt("Poslana, čaka odgovor"),
    accepted: tt("Sprejeta ponudba"),
    declined: tt("Zavrnjena ponudba"),
  };

  type FilterChip = { key: string; label: string; onRemove: () => void };
  const activeFilterChips: FilterChip[] = [];
  if (searchFilter.trim()) {
    activeFilterChips.push({
      key: "search",
      label: `${t("searchCandidates")}: ${searchFilter.trim()}`,
      onRemove: () => updateSearchFilter(""),
    });
  }
  if (jobFilter !== "all") {
    activeFilterChips.push({ key: "job", label: jobFilter, onRemove: () => setJobFilter("all") });
  }
  if (ratingFilter !== "all") {
    activeFilterChips.push({
      key: "rating",
      label: ratingFilter === "highest" ? t("highestRating") : t("lowestRating"),
      onRemove: () => setRatingFilter("all"),
    });
  }
  if (jobStatusFilter !== "all") {
    activeFilterChips.push({
      key: "jobStatus",
      label: jobStatusFilter === "active" ? tt("Aktivna dela") : tt("Neaktivna dela"),
      onRemove: () => setJobStatusFilter("all"),
    });
  }
  if (statusFilters.new) {
    activeFilterChips.push({
      key: "new",
      label: t("newApplicantBadge"),
      onRemove: () => toggleStatusFilter("new", false),
    });
  }
  if (offerStatusFilters.offer) {
    activeFilterChips.push({
      key: "offer",
      label: tt("Ponudba"),
      onRemove: () => toggleOfferStatusFilter("offer", false),
    });
    (["preparing", "sent", "accepted", "declined"] as const).forEach((key) => {
      if (offerStatusFilters[key]) {
        activeFilterChips.push({
          key: `offer-${key}`,
          label: offerSubFilterLabels[key],
          onRemove: () => toggleOfferStatusFilter(key, false),
        });
      }
    });
  }

  const clearAllFilters = () => {
    updateSearchFilter("");
    setJobFilter("all");
    setRatingFilter("all");
    setJobStatusFilter("all");
    setStatusFilters({ ...defaultStatusFilters });
    setOfferStatusFilters({ ...defaultOfferStatusFilters });
  };

  return (
    <ListReportShell
      title={t("applicants")}
      subtitle={tt("Operativni pregled kandidatov po fazi, poziciji, oceni in naslednjem koraku.")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {selectedApplicants.length > 0 ? (
            <span className="text-sm font-medium text-muted-foreground">
              {selectedApplicants.length} {tt("izbranih")}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={selectedApplicants.length < 2}
            onClick={() => setIsCompareOpen(true)}
          >
            {tt("Primerjaj kandidate")}
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>{t("addCandidate")}</Button>
        </div>
      }
      tabs={stageTabs}
      activeTab={stageTab}
      onTabChange={setStageTab}
    >
      <CandidateComparisonDialog
        candidates={selectedApplicants}
        open={isCompareOpen}
        onOpenChange={setIsCompareOpen}
        returnTo={currentApplicantsPath}
      />
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="grid max-h-[94vh] w-[min(1080px,calc(100vw-2rem))] max-w-none grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-none">
          <DialogHeader>
            <div className="px-6 pt-6">
            <DialogTitle>{t("addCandidate")}</DialogTitle>
            <DialogDescription>
              {tt("Kandidata bomo vključili v voden proces pregleda in odločanja.")}
            </DialogDescription>
            </div>
          </DialogHeader>
          <ol className="flex items-center border-b border-border px-6 py-4" aria-label={tt("Koraki dodajanja kandidata")}>
            {candidateImportSteps.map((stepLabel, index) => {
              const label = tt(stepLabel);
              const step = index + 1;
              const complete = step < importStep;
              const current = step === importStep;
              return (
                <li key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
                  <button
                    type="button"
                    disabled={step > importStep || (step === 2 && !selectedJobId)}
                    onClick={() => setImportStep(step)}
                    aria-current={current ? "step" : undefined}
                    className={`flex items-center gap-2 text-sm font-medium ${
                      current ? "text-foreground" : complete ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      current ? "bg-primary text-primary-foreground" : complete ? "bg-emerald-500 text-white" : "border border-border"
                    }`}>
                      {complete ? <Check className="h-4 w-4" /> : step}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                  {step < 3 ? <span className={`mx-3 h-px min-w-5 flex-1 ${complete ? "bg-emerald-500/60" : "bg-border"}`} /> : null}
                </li>
              );
            })}
          </ol>
          <div className={`grid min-h-0 gap-8 overflow-y-auto px-6 py-5 ${importStep === 3 ? "lg:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]" : ""}`}>
            <div className="grid min-w-0 content-start gap-2.5">
              {importStep === 1 ? <>
                <div>
                  <p className="text-lg font-semibold text-foreground">{tt("Za katero pozicijo dodajaš kandidata?")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{tt("Izbrana pozicija določi kriterije pregleda in nadaljnji potek dela.")}</p>
                </div>
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
              {selectedJob ? (
                <div className="mt-3 border-l-2 border-primary pl-4 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{tt("Izbrana pozicija")}</span>
                  <p className="mt-0.5">{tt("Kandidat bo dodan v standardni potek pregleda za to delovno mesto.")}</p>
                </div>
              ) : null}
              <div className="mt-5 border-t border-border pt-4">
                <p className="section-label">{tt("Vstop v workflow")}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  {candidateWorkflowPreviewStages.map((stage, index) => (
                    <div key={stage} className="contents">
                      <span className={index === 0 ? "font-semibold text-foreground" : ""}>{stageLabel(stage as Stage)}</span>
                      {index < 4 ? <span className="h-px min-w-3 flex-1 bg-border" /> : null}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{t("candidateStageAppliedNote")}</p>
              </div>
              </> : null}

              {importStep === 2 ? <>
              <div>
                <p className="text-lg font-semibold text-foreground">{tt("Dodaj enega ali več življenjepisov")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tt("Ime kandidata prepoznamo iz PDF-ja; pred uvozom ga lahko popraviš.")}</p>
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
              </> : null}

              {importStep === 3 ? <>
              <div>
                <p className="text-lg font-semibold text-foreground">{tt("Preveri in vključi v workflow")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resumeItems.length} {tt("kandidatov bo dodanih v fazo")} <span className="font-semibold text-foreground">{stageLabel("Applied")}</span>.
                </p>
              </div>
              <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{t("jobTitle")}</dt>
                  <dd className="font-medium text-foreground">{selectedJob?.title}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{tt("Kandidati")}</dt>
                  <dd className="text-right font-medium text-foreground">{resumeItems.map((item) => item.candidateName).filter(Boolean).join(", ")}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted-foreground">{tt("Naslednje")}</dt>
                  <dd className="text-right text-foreground">{tt("Pregled → odločitev → razgovor")}</dd>
                </div>
              </dl>
              </> : null}
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
            {importStep === 3 ? <div className="min-h-0 min-w-0 lg:border-l lg:border-border lg:pl-6">
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
              <div className="mt-3 flex min-h-[360px] items-center justify-center lg:h-[52vh] lg:max-h-[560px]">
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
            </div> : null}
          </div>
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <Button
              variant="ghost"
              onClick={() => {
                if (importStep > 1) setImportStep((step) => step - 1);
                else {
                  setIsAddOpen(false);
                  resetForm();
                }
              }}
              disabled={isSaving}
            >
              {importStep > 1 ? tt("Nazaj") : t("cancel")}
            </Button>
            {importStep < 3 ? (
              <Button
                onClick={() => setImportStep((step) => step + 1)}
                disabled={importStep === 1 ? !selectedJobId : resumeItems.length === 0 || isProcessingResumes}
                className="gap-2"
              >
                {tt("Naprej")} <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSaveCandidate} disabled={!canSaveCandidates}>
                {isSaving ? saveStatus ?? t("saving") : t("importCandidates")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <StatStrip
        items={[
          { label: tt("Aktivni kandidati"), value: baseFilteredApplicants.filter((item) => item.stage !== "Accepted" && item.stage !== "Rejected").length, detail: tt("V odprtem procesu") },
          { label: tt("Čaka pregled"), value: baseFilteredApplicants.filter((item) => item.stage === "Applied" || item.stage === "Screening").length, detail: tt("Potreben naslednji korak") },
          { label: tt("Razgovori"), value: baseFilteredApplicants.filter((item) => item.stage === "Interview").length, detail: tt("V aktivni fazi razgovora") },
          { label: tt("Ponudbe"), value: baseFilteredApplicants.filter((item) => item.stage === "Offer").length, detail: tt("V pripravi ali odločanju") },
          { label: tt("Sprejeti"), value: baseFilteredApplicants.filter((item) => item.stage === "Accepted").length, detail: tt("Zaključeni uspešno") },
        ]}
      />

      {/* Filters Bar */}
      <div className="grid gap-3 border-b border-border pb-4">
        {/* Primary filters: search + job + advanced toggle (status = stage tabs) */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative grid flex-1 gap-1.5">
            <Label>{t("searchCandidates")}</Label>
            <Input
              type="search"
              value={searchFilter}
              onChange={(event) => {
                updateSearchFilter(event.target.value);
                setIsApplicantSearchOpen(true);
              }}
              onFocus={() => setIsApplicantSearchOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsApplicantSearchOpen(false), 120);
              }}
              placeholder={`${t("searchCandidates")} / ID`}
              className="h-10 border-border bg-background shadow-sm dark:bg-muted/30"
            />
            {isApplicantSearchOpen ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-popover p-2 shadow-xl">
                {applicantSearchSuggestions.length ? (
                  <div className="space-y-1">
                    {applicantSearchSuggestions.map((applicant) => (
                      <button
                        key={applicant.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          updateSearchFilter(applicant.name);
                          setIsApplicantSearchOpen(false);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {applicant.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {applicant.role}
                          </span>
                        </span>
                        <ScoreChip
                          score={
                            applicant.analysisStatus === "complete" &&
                            typeof applicant.aiScore === "number"
                              ? applicant.aiScore
                              : null
                          }
                          emptyLabel={t("notScored")}
                          className="shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    {t("noSearchResults")}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="grid gap-1.5 lg:w-64">
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
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2"
            onClick={() => setShowAdvancedFilters((value) => !value)}
            aria-expanded={showAdvancedFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {tt("Napredni filtri")}
            {advancedActiveCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-semibold text-foreground">
                {advancedActiveCount}
              </span>
            ) : null}
            <ChevronDown
              className={clsx("h-4 w-4 transition-transform", showAdvancedFilters && "rotate-180")}
            />
          </Button>
        </div>

        {/* Advanced filters (collapsed by default) */}
        {showAdvancedFilters ? (
          <div className="grid gap-3 rounded-lg bg-muted/30 p-3">
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
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
              <div className="grid gap-1.5">
                <Label>Status delovnega mesta</Label>
                <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                  <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
                    <SelectValue placeholder="Status delovnega mesta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Aktivna in neaktivna dela</SelectItem>
                    <SelectItem value="active">Kandidati za aktivna dela</SelectItem>
                    <SelectItem value="inactive">Kandidati za neaktivna dela</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("statusFilters")}</Label>
                <div className="flex h-10 items-center rounded-lg bg-background px-3 dark:bg-muted/30">
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
                </div>
              </div>
            </div>

            {/* Offer status — only meaningful within the Ponudba phase */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-background px-3 py-2 dark:bg-muted/30">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox
                  className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                  checked={offerStatusFilters.offer}
                  onCheckedChange={(checked) =>
                    toggleOfferStatusFilter("offer", checked === true)
                  }
                />
                {tt("Ponudba")}
              </label>
              <div
                className={clsx(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 border-l border-border pl-4 transition-opacity",
                  !offerStatusFilters.offer && "pointer-events-none opacity-45",
                )}
                aria-disabled={!offerStatusFilters.offer}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.preparing}
                    disabled={!offerStatusFilters.offer}
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
                    disabled={!offerStatusFilters.offer}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("sent", checked === true)
                    }
                  />
                  {tt("Poslana, čaka odgovor")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.accepted}
                    disabled={!offerStatusFilters.offer}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("accepted", checked === true)
                    }
                  />
                  {tt("Sprejeta ponudba")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.declined}
                    disabled={!offerStatusFilters.offer}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("declined", checked === true)
                    }
                  />
                  {tt("Zavrnjena ponudba")}
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* Active filter chips */}
        {activeFilterChips.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {tt("Počisti vse")}
            </button>
          </div>
        ) : null}
      </div>

      {isLoadingCandidates ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            {t("loadingCandidates")}
          </div>
        </div>
      ) : (
        <>
          <ApplicantWorkTable
            applicants={paginatedApplicants}
            returnTo={currentApplicantsPath}
            onDelete={handleDeleteApplicant}
            onMarkNewReviewed={handleMarkNewReviewed}
            selectedIds={selectedApplicantIds}
            onToggleSelection={toggleApplicantSelection}
            onToggleAll={toggleAllVisibleApplicants}
          />
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card lg:hidden">
            {paginatedApplicants.map((applicant) => (
              <ApplicantCard
                key={applicant.id}
                applicant={applicant}
                returnTo={currentApplicantsPath}
                onDelete={handleDeleteApplicant}
                onMarkNewReviewed={handleMarkNewReviewed}
              />
            ))}
          </div>
        </>
      )}

      {!isLoadingCandidates && filteredApplicants.length > applicantsPerPage && (
        <div className="flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-1 py-1 shadow-sm">
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
    </ListReportShell>
  );
}
