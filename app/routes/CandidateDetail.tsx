import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { supabase } from "../lib/supabase";
import { getAiWritingSignal } from "../lib/aiWritingSignal";
import { ScoreRing } from '../components/ScoreRing';
import { 
  ArrowLeft, ThumbsUp, ThumbsDown,
  CheckCircle, XCircle, Clock, Bot
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from 'recharts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { useI18n } from "../lib/i18n";

type CandidateDetailRecord = {
  id: string;
  full_name: string;
  job_title: string;
  email: string | null;
  location: string | null;
  years_experience: number | null;
  ats_score: number | null;
  skills: string[] | null;
  analysis_summary: string | null;
  analysis_strengths: string[] | null;
  analysis_concerns: string[] | null;
  ai_writing_score: number | null;
  ai_writing_label: string | null;
  ai_writing_notes: string[] | null;
  skill_profile: Record<string, number> | null;
};

const baseCandidateSelect =
  "id, full_name, job_title, email, location, years_experience, ats_score, skills, analysis_summary, analysis_strengths, analysis_concerns, skill_profile";

const candidateSelectWithAiWriting =
  `${baseCandidateSelect}, ai_writing_score, ai_writing_label, ai_writing_notes`;

export default function CandidateDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const [candidate, setCandidate] = useState<CandidateDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCandidate = async () => {
      if (!id) return;

      const result = await supabase
        .from("candidates")
        .select(candidateSelectWithAiWriting)
        .eq("id", id)
        .single();

      const shouldRetryWithoutAiWriting =
        result.error &&
        (result.error.message?.includes("ai_writing") ||
          result.error.details?.includes("ai_writing"));

      const fallbackResult = shouldRetryWithoutAiWriting
        ? await supabase
            .from("candidates")
            .select(baseCandidateSelect)
            .eq("id", id)
            .single()
        : result;

      if (!isMounted) return;

      if (fallbackResult.error) {
        setCandidate(null);
        setIsLoading(false);
        return;
      }

      setCandidate({
        ai_writing_score: null,
        ai_writing_label: null,
        ai_writing_notes: [],
        ...fallbackResult.data,
      } as CandidateDetailRecord);
      setIsLoading(false);
    };

    loadCandidate();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const radarData = useMemo(() => {
    if (!candidate) {
      return [
        { subject: "Technical", A: 0, fullMark: 100 },
        { subject: "Culture", A: 0, fullMark: 100 },
        { subject: "Communication", A: 0, fullMark: 100 },
        { subject: "Experience", A: 0, fullMark: 100 },
        { subject: "Leadership", A: 0, fullMark: 100 },
        { subject: "Problem Solving", A: 0, fullMark: 100 },
      ];
    }

    const profile = candidate.skill_profile;
    if (profile) {
      return [
        { subject: "Technical", A: profile.technical ?? 0, fullMark: 100 },
        { subject: "Culture", A: profile.culture ?? 0, fullMark: 100 },
        { subject: "Communication", A: profile.communication ?? 0, fullMark: 100 },
        { subject: "Experience", A: profile.experience ?? 0, fullMark: 100 },
        { subject: "Leadership", A: profile.leadership ?? 0, fullMark: 100 },
        { subject: "Problem Solving", A: profile.problem_solving ?? 0, fullMark: 100 },
      ];
    }

    const score = candidate.ats_score ?? 0;
    const years = Number(candidate.years_experience ?? 0);

    return [
      { subject: "Technical", A: score, fullMark: 100 },
      { subject: "Culture", A: Math.max(score - 10, 0), fullMark: 100 },
      {
        subject: "Communication",
        A: Math.min(score + 5, 100),
        fullMark: 100,
      },
      { subject: "Experience", A: Math.min(years * 10, 100), fullMark: 100 },
      { subject: "Leadership", A: Math.max(score - 20, 0), fullMark: 100 },
      { subject: "Problem Solving", A: Math.max(score - 5, 0), fullMark: 100 },
    ];
  }, [candidate]);

  const aiWritingSignal = useMemo(() => {
    const fallbackSignal = getAiWritingSignal({
        name: candidate?.full_name,
        role: candidate?.job_title,
        analysisSummary: candidate?.analysis_summary,
        strengths: candidate?.analysis_strengths,
        concerns: candidate?.analysis_concerns,
        skills: candidate?.skills,
        yearsExperience: candidate?.years_experience,
        atsScore: candidate?.ats_score,
    });

    return {
      score: Math.round(Number(candidate?.ai_writing_score ?? fallbackSignal.score)),
      label: candidate?.ai_writing_label ?? fallbackSignal.label,
      tone:
        (candidate?.ai_writing_score ?? fallbackSignal.score) >= 68
          ? "high"
          : (candidate?.ai_writing_score ?? fallbackSignal.score) >= 38
            ? "medium"
            : "low",
      notes:
        candidate?.ai_writing_notes?.length
          ? candidate.ai_writing_notes
          : fallbackSignal.notes,
    };
  }, [candidate]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{t("loadingCandidate")}</div>;
  }

  if (!candidate) {
    return <div className="p-8 text-center text-muted-foreground">{t("candidateNotFound")}</div>;
  }

   return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-none border-b border-border bg-card px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/applicants" className="rounded-full p-2 text-muted-foreground hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">{candidate.full_name}</h1>
              <p className="text-sm text-muted-foreground">{t("appliedFor")} <span className="font-medium text-foreground">{candidate.job_title}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("overallMatchScore")}
            </p>
            <ScoreRing score={candidate.ats_score ?? 0} size="md" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content (Scrollable) */}
        <div className="flex-1 space-y-8 overflow-y-auto p-8">
           
           {/* Top Stats */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="surface-card p-6 lg:col-span-2">
                 <h2 className="mb-4 flex items-center text-lg font-semibold text-foreground">
                   <div className="mr-3 rounded-md bg-muted p-1.5 text-foreground">
                     <Clock className="h-5 w-5" />
                   </div>
                   {t("aiAnalysisSummary")}
                 </h2>
                 <p className="mb-6 leading-relaxed text-muted-foreground">
                  {candidate.analysis_summary ?? t("aiAnalysisPending")}
                </p>
                 
                  <Accordion type="multiple" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <AccordionItem value="strengths" className="border-none">
                      <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-bold text-emerald-800 flex items-center">
                            <ThumbsUp className="h-4 w-4 mr-2" />
                            {t("strengths")}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-3">
                          <ul className="space-y-2">
                            {(candidate.analysis_strengths ?? []).map((pro, i) => (
                              <li key={i} className="flex items-start text-sm text-emerald-700">
                                <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </div>
                    </AccordionItem>
                    <AccordionItem value="concerns" className="border-none">
                      <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-bold text-red-800 flex items-center">
                            <ThumbsDown className="h-4 w-4 mr-2" />
                            {t("potentialConcerns")}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-3">
                          <ul className="space-y-2">
                            {(candidate.analysis_concerns ?? []).map((con, i) => (
                              <li key={i} className="flex items-start text-sm text-red-700">
                                <XCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </div>
                    </AccordionItem>
                  </Accordion>
              </div>

              <div className="surface-card p-6">
                <h2 className="mb-4 text-lg font-semibold text-foreground">{t("skillsProfile")}</h2>
                <div className="h-64 min-h-[256px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <PolarRadiusAxis
                        angle={30}
                        domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name="Candidate"
                        dataKey="A"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        fill="#8b5cf6"
                        fillOpacity={0.36}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(candidate.skills ?? []).slice(0, 5).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

           </div>


        </div>

        <aside className="hidden w-[22rem] overflow-y-auto border-l border-border bg-card p-6 xl:block">
          <div className="surface-card bg-background/45 p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Bot className="h-5 w-5 text-cyan-500" />
                  {t("cvAiWritingSignal")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("aiWritingSignalDescription")}
                </p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold leading-none text-foreground">
                  {aiWritingSignal.score}
                </div>
                <div className="text-xs text-muted-foreground">/100</div>
              </div>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500"
                style={{ width: `${aiWritingSignal.score}%` }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span
                className={
                  aiWritingSignal.tone === "high"
                    ? "font-medium text-pink-500"
                    : aiWritingSignal.tone === "medium"
                      ? "font-medium text-purple-500"
                      : "font-medium text-green-500"
                }
              >
                {aiWritingSignal.label}
              </span>
              <span className="text-muted-foreground">{t("reviewCue")}</span>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("signalNotes")}
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {aiWritingSignal.notes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-cyan-400" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {t("aiWritingProofNote")}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
