import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Bot, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
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
import { fetchJobOptions, getCachedJobOptions, setCachedJobOptions } from "../lib/jobCache";

type JobOption = {
  id: string;
  title: string;
  description: string | null;
};

type AiAgentSettingsRecord = {
  scoring_strictness: string;
  response_tone: string;
  interview_question_style: string;
  ai_writing_sensitivity: string;
  evaluation_focus: string[];
  custom_instructions: string | null;
};

const defaultSettings: AiAgentSettingsRecord = {
  scoring_strictness: "balanced",
  response_tone: "professional",
  interview_question_style: "practical",
  ai_writing_sensitivity: "balanced",
  evaluation_focus: [],
  custom_instructions: "",
};

const focusOptions = [
  "role_critical_skills",
  "measurable_impact",
  "seniority",
  "transferable_experience",
  "communication",
  "leadership",
  "certifications",
] as const;

const optionLabels: Record<"en" | "sl", Record<string, string>> = {
  en: {
    role_critical_skills: "Role-critical skills",
    measurable_impact: "Measurable impact",
    seniority: "Seniority and scope",
    transferable_experience: "Transferable experience",
    communication: "Communication evidence",
    leadership: "Leadership evidence",
    certifications: "Certifications",
  },
  sl: {
    role_critical_skills: "Ključne veščine za vlogo",
    measurable_impact: "Merljivi dosežki",
    seniority: "Senioriteta in obseg odgovornosti",
    transferable_experience: "Prenosljive izkušnje",
    communication: "Dokazi komunikacije",
    leadership: "Dokazi vodenja",
    certifications: "Certifikati in izobrazba",
  },
};

const strictnessLabels: Record<"en" | "sl", Record<string, string>> = {
  en: {
    lenient: "Lenient",
    balanced: "Balanced",
    strict: "Strict",
  },
  sl: {
    lenient: "Bolj prizanesljivo",
    balanced: "Uravnoteženo",
    strict: "Strogo",
  },
};

const toJobOptions = (
  jobs: Array<{ id: string; title: string; description?: string | null }>,
) =>
  jobs.map((job) => ({
    id: job.id,
    title: job.title,
    description: job.description ?? null,
  }));

export default function AiAgentSettings() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const cachedJobOptions = getCachedJobOptions();
  const [jobs, setJobs] = useState<JobOption[]>(
    cachedJobOptions ? toJobOptions(cachedJobOptions.jobs) : [],
  );
  const [selectedJobId, setSelectedJobId] = useState("");
  const [settings, setSettings] = useState<AiAgentSettingsRecord>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasCustomSettings, setHasCustomSettings] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/applicants");
  };

  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      const cached = getCachedJobOptions();
      if (cached) {
        setJobs(toJobOptions(cached.jobs));
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      let nextJobs: JobOption[] = [];
      try {
        nextJobs = toJobOptions(await fetchJobOptions({ force: Boolean(cached) }));
      } catch (jobError) {
        if (!isMounted) return;

        const message = jobError instanceof Error ? jobError.message : String(jobError);
        setError(message);
        if (!cached) setJobs([]);
        setIsLoading(false);
        return;
      }

      if (!isMounted) return;

      const requestedJobId = new URLSearchParams(location.search).get("jobId");
      setJobs(nextJobs);
      setCachedJobOptions(nextJobs);
      setSelectedJobId((current) =>
        current ||
        nextJobs.find((job) => job.id === requestedJobId)?.id ||
        nextJobs[0]?.id ||
        "",
      );
      setIsLoading(false);
    };

    loadJobs();

    return () => {
      isMounted = false;
    };
  }, [location.search]);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      if (!selectedJobId) {
        setSettings(defaultSettings);
        setHasCustomSettings(false);
        return;
      }

      setStatus(null);
      setError(null);
      const { data, error: settingsError } = await supabase
        .from("ai_agent_settings")
        .select(
          "scoring_strictness, response_tone, interview_question_style, ai_writing_sensitivity, evaluation_focus, custom_instructions",
        )
        .eq("job_id", selectedJobId)
        .maybeSingle();

      if (!isMounted) return;

      if (settingsError) {
        setSettings(defaultSettings);
        setHasCustomSettings(false);
        setError(settingsError.message);
        return;
      }

      setSettings({
        ...defaultSettings,
        ...(data ?? {}),
        custom_instructions: data?.custom_instructions ?? "",
        evaluation_focus: data?.evaluation_focus ?? [],
      });
      setHasCustomSettings(Boolean(data));
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [selectedJobId]);

  const updateSetting = <Key extends keyof AiAgentSettingsRecord>(
    key: Key,
    value: AiAgentSettingsRecord[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatus(null);
  };

  const toggleFocus = (focus: string, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      evaluation_focus: checked
        ? [...new Set([...current.evaluation_focus, focus])]
        : current.evaluation_focus.filter((item) => item !== focus),
    }));
    setStatus(null);
  };

  const saveSettings = async () => {
    if (!selectedJobId) return;

    setIsSaving(true);
    setError(null);
    setStatus(null);

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setError(t("signedInRequiredJob"));
      setIsSaving(false);
      return;
    }

    const { error: upsertError } = await supabase
      .from("ai_agent_settings")
      .upsert(
        {
          user_id: sessionData.session.user.id,
          job_id: selectedJobId,
          scoring_strictness: settings.scoring_strictness,
          response_tone: settings.response_tone,
          interview_question_style: settings.interview_question_style,
          ai_writing_sensitivity: settings.ai_writing_sensitivity,
          evaluation_focus: settings.evaluation_focus,
          custom_instructions: settings.custom_instructions?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,job_id" },
      );

    if (upsertError) {
      setError(upsertError.message);
    } else {
      const { data: savedSettings, error: verifyError } = await supabase
        .from("ai_agent_settings")
        .select(
          "scoring_strictness, response_tone, interview_question_style, ai_writing_sensitivity, evaluation_focus, custom_instructions",
        )
        .eq("job_id", selectedJobId)
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();

      if (verifyError || !savedSettings) {
        setError(verifyError?.message ?? t("aiAgentSettingsVerifyFailed"));
        setIsSaving(false);
        return;
      }

      setSettings({
        ...defaultSettings,
        ...savedSettings,
        custom_instructions: savedSettings.custom_instructions ?? "",
        evaluation_focus: savedSettings.evaluation_focus ?? [],
      });
      setHasCustomSettings(true);
      setStatus(t("aiAgentSettingsSaved"));
    }

    setIsSaving(false);
  };

  const resetSettings = async () => {
    if (!selectedJobId) return;

    setIsSaving(true);
    setError(null);
    setStatus(null);

    const { error: deleteError } = await supabase
      .from("ai_agent_settings")
      .delete()
      .eq("job_id", selectedJobId);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSettings(defaultSettings);
      setHasCustomSettings(false);
      setStatus(t("aiAgentSettingsReset"));
    }

    setIsSaving(false);
  };

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{t("aiAgent")}</h1>
          <p className="text-sm subtle-text">{t("aiAgentSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetSettings}
            disabled={isSaving || !selectedJobId}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            {t("resetToDefaultSettings")}
          </Button>
          <Button
            type="button"
            onClick={saveSettings}
            disabled={isSaving || !selectedJobId}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? t("saving") : t("saveAiAgent")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="surface-card border-dashed p-8 text-sm text-muted-foreground">
          {t("loadingSettings")}
        </div>
      ) : jobs.length === 0 ? (
        <div className="surface-card border-dashed p-8 text-sm text-muted-foreground">
          {t("aiAgentNoJobs")}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="surface-card p-5">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label>{t("job")}</Label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger>
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("scoringStrictness")}</Label>
                  <Select
                    value={settings.scoring_strictness}
                    onValueChange={(value) => updateSetting("scoring_strictness", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lenient">{t("strictnessLenient")}</SelectItem>
                      <SelectItem value="balanced">{t("strictnessBalanced")}</SelectItem>
                      <SelectItem value="strict">{t("strictnessStrict")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>{t("responseTone")}</Label>
                  <Select
                    value={settings.response_tone}
                    onValueChange={(value) => updateSetting("response_tone", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">{t("toneProfessional")}</SelectItem>
                      <SelectItem value="direct">{t("toneDirect")}</SelectItem>
                      <SelectItem value="supportive">{t("toneSupportive")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>{t("interviewQuestionStyle")}</Label>
                  <Select
                    value={settings.interview_question_style}
                    onValueChange={(value) =>
                      updateSetting("interview_question_style", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="practical">{t("questionsPractical")}</SelectItem>
                      <SelectItem value="technical">{t("questionsTechnical")}</SelectItem>
                      <SelectItem value="behavioral">{t("questionsBehavioral")}</SelectItem>
                      <SelectItem value="gap_focused">{t("questionsGapFocused")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>{t("aiWritingSensitivity")}</Label>
                  <Select
                    value={settings.ai_writing_sensitivity}
                    onValueChange={(value) =>
                      updateSetting("ai_writing_sensitivity", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("sensitivityLow")}</SelectItem>
                      <SelectItem value="balanced">{t("sensitivityBalanced")}</SelectItem>
                      <SelectItem value="high">{t("sensitivityHigh")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3">
                <Label>{t("evaluationFocus")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {focusOptions.map((focus) => (
                    <label
                      key={focus}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={settings.evaluation_focus.includes(focus)}
                        onCheckedChange={(checked) =>
                          toggleFocus(focus, checked === true)
                        }
                      />
                      {optionLabels[language][focus]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{t("customAiInstructions")}</Label>
                <Textarea
                  value={settings.custom_instructions ?? ""}
                  onChange={(event) =>
                    updateSetting("custom_instructions", event.target.value)
                  }
                  placeholder={t("customAiInstructionsPlaceholder")}
                  className="min-h-36 resize-y"
                  maxLength={1600}
                />
                <p className="text-xs text-muted-foreground">
                  {t("customAiInstructionsGuardrail")}
                </p>
              </div>

              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
            </div>
          </section>

          <aside className="surface-card h-fit p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2 text-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t("activeAiAgentReference")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedJob?.title ?? t("selectJob")}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-md border border-border bg-muted/35 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                {hasCustomSettings ? t("customAiAgentActive") : t("defaultSettingsActive")}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {hasCustomSettings
                  ? t("customAiAgentActiveDescription")
                  : t("defaultSettingsActiveDescription")}
              </p>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("scoringStrictness")}
                </span>
                <p className="mt-1 font-medium text-foreground">
                  {strictnessLabels[language][settings.scoring_strictness] ??
                    settings.scoring_strictness}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("evaluationFocus")}
                </span>
                <p className="mt-1 text-muted-foreground">
                  {settings.evaluation_focus.length
                    ? settings.evaluation_focus
                        .map((focus) => optionLabels[language][focus] ?? focus)
                        .join(", ")
                    : t("defaultSettings")}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
