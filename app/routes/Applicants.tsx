import { useEffect, useState } from "react";
import { useAppStore, type Applicant, type Stage } from "../store";
import { ApplicantCard } from "../components/ApplicantCard";
import { Filter, SortAsc, Search } from "lucide-react";
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

export default function Applicants() {
  const { applicants } = useAppStore();
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; description?: string | null }>
  >([]);
  const [remoteApplicants, setRemoteApplicants] = useState<Applicant[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [filterScore, setFilterScore] = useState<number>(0);
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
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCandidates = async () => {
      const [{ data: candidateRows, error: candidateError }, { data: jobRows, error: jobError }] =
        await Promise.all([
          supabase
            .from("candidates")
            .select(
              "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_preview_url, analysis_summary, analysis_strengths, analysis_concerns, skill_profile, created_at",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("jobs")
            .select("id, title, description")
            .order("created_at", { ascending: false }),
        ]);

      if (!isMounted) return;

      if (candidateError || jobError) {
        setRemoteApplicants([]);
        setJobs([]);
        setIsLoadingCandidates(false);
        return;
      }

      const mapped = (candidateRows ?? []).map((row) => {
        const skillProfile = (row as { skill_profile?: Record<string, number> })
          .skill_profile;

        return {
          id: row.id,
          name: row.full_name,
          role: row.job_title,
          stage: (row as { stage?: Stage }).stage ?? "Applied",
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
                culture: skillProfile.culture ?? 0,
              }
            : undefined,
          matchAnalysis: {
            pros: row.analysis_strengths ?? [],
            cons: row.analysis_concerns ?? [],
          },
        } as Applicant;
      });

      setRemoteApplicants(mapped);
      setJobs(
        (jobRows ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
        })),
      );
      setIsLoadingCandidates(false);
    };

    loadCandidates();

    return () => {
      isMounted = false;
    };
  }, []);

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
      setResumeError(result.error ?? "Failed to generate preview.");
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
  };

  const handleDeleteApplicant = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this applicant? This action cannot be undone.",
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

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error("You must be signed in to save a candidate.");
      }

      let resumePath: string | null = null;
      let normalizedResumeText = resumeText;

      if (resumeFile && !normalizedResumeText.trim()) {
        const extracted = await extractPdfText(resumeFile);
        normalizedResumeText = extracted;
        setResumeText(extracted);
      }

      if (resumeFile && !normalizedResumeText.trim()) {
        throw new Error(
          "Resume text could not be extracted. Please upload a text-based PDF.",
        );
      }

      if (resumeFile) {
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
        const accessToken = sessionData.session.access_token;
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`;

        await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            candidateId: inserted.id,
            jobTitle,
            jobDescription,
            resumeText: normalizedResumeText,
          }),
        });
      }

      resetForm();
      setIsAddOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save candidate.";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredApplicants = remoteApplicants.filter((app) => {
    return (
      app.aiScore >= filterScore &&
      (app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       app.role.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Applicants</h1>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          
          <button className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <SortAsc className="mr-2 h-4 w-4 text-slate-500" />
            Sort
          </button>
          <Button
            className="bg-gradient-to-r from-neutral-800 to-zinc-600 hover:from-neutral-600 hover:to-neutral-500 hover:text-black cursor:hover"
            onClick={() => setIsAddOpen(true)}
          >
            Add Candidate
          </Button>
        </div>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
            <DialogDescription>
              Add a new candidate profile. This is a placeholder form for now.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="candidate-name">Full name</Label>
                <Input
                  id="candidate-name"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="candidate-role">Job title</Label>
                <Select
                  value={jobTitle}
                  onValueChange={(value) => {
                    setJobTitle(value);
                    const selectedJob = jobs.find((job) => job.title === value);
                    setJobDescription(selectedJob?.description ?? "");
                  }}
                >
                  <SelectTrigger id="candidate-role">
                    <SelectValue placeholder="Select a job" />
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
              <div className="grid gap-2">
                <Label htmlFor="candidate-stage">Stage</Label>
                <Select value={stage} onValueChange={(value) => setStage(value as Stage)}>
                  <SelectTrigger id="candidate-stage">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Applied", "Screening", "Interview", "Offer", "Rejected"] as Stage[]).map(
                      (stageOption) => (
                        <SelectItem key={stageOption} value={stageOption}>
                          {stageOption}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="candidate-resume">Upload resume (PDF)</Label>
                <Input
                  id="candidate-resume"
                  type="file"
                  accept="application/pdf"
                  onChange={handleResumeUpload}
                />
                {resumeFileName && (
                  <p className="text-xs text-slate-500">
                    {isConverting
                      ? "Converting PDF preview..."
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
            </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  Resume Preview
                </h3>
                {resumePreview && (
                  <button className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    View full
                  </button>
                )}
              </div>
              <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
                {resumePreview ? (
                  <img
                    src={resumePreview}
                    alt="Resume preview"
                    className="h-full max-h-[280px] w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">
                    Upload a PDF to preview the first page
                  </span>
                )}
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
              onClick={handleSaveCandidate}
              disabled={
                isSaving ||
                !fullName ||
                !jobTitle ||
                isConverting
              }
            >
              {isSaving ? "Saving..." : "Save Candidate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border-slate-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Min AI Score: {filterScore}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={filterScore}
            onChange={(e) => setFilterScore(Number(e.target.value))}
            className="w-32 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-zinc-800"
          />
        </div>
      </div>

      {isLoadingCandidates ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16 text-sm text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-neutral-600" />
            Loading candidates...
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
          <p className="text-slate-500">No applicants found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}
