import {
  Bot,
  Check,
  Circle,
  FileAudio,
  FileText,
  Mic,
  Save,
  Sparkles,
  UserRound,
  UserPlus,
  ChevronsUpDown,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type RoadmapCandidate = {
  id: string;
  name: string;
  role: string;
  stage: string;
  interviewAnalysisStatus?: string | null;
  interviewQuestions: string[];
  followUpQuestions: string[];
  isNew?: boolean;
};

type RoadmapTranscript = {
  id: string;
  title: string;
  durationSeconds: number;
  createdAt: string;
  status: "local" | "recorded" | "processing" | "complete" | "failed";
};

interface CandidateInterviewRoadmapProps {
  candidate: RoadmapCandidate | null;
  candidates: RoadmapCandidate[];
  transcripts: RoadmapTranscript[];
  selectedCandidateId: string;
  selectedTranscriptId?: string;
  recordingStatus: "idle" | "recording" | "paused" | "ready";
  isSaving: boolean;
  isTranscribing: boolean;
  isAnalyzing: boolean;
  hasUnsavedChanges: boolean;
  onCandidateChange: (candidateId: string) => void;
  onRecord: () => void;
  onStop: () => void;
  onSaveRecording: () => void;
  onSaveRoadmap: () => void;
  onSelectTranscript: (transcriptId: string) => void;
  onTranscribe: () => void;
  onAnalyze: () => void;
}

const transcriptStatusLabel: Record<RoadmapTranscript["status"], string> = {
  local: "Lokalni osnutek",
  recorded: "Posnetek shranjen",
  processing: "Transkripcija poteka",
  complete: "Transkript pripravljen",
  failed: "Potrebna ponovitev",
};

const roadmapStageLabels: Record<string, string> = {
  Applied: "Prijavljen",
  Screening: "Pregled",
  Interview: "Razgovor",
  Offer: "Ponudba",
  Accepted: "Sprejet",
  Rejected: "Zavrnjen",
};

const formatRoadmapDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

export function CandidateInterviewRoadmap({
  candidate,
  candidates,
  transcripts,
  selectedCandidateId,
  selectedTranscriptId,
  recordingStatus,
  isSaving,
  isTranscribing,
  isAnalyzing,
  hasUnsavedChanges,
  onCandidateChange,
  onRecord,
  onStop,
  onSaveRecording,
  onSaveRoadmap,
  onSelectTranscript,
  onTranscribe,
  onAnalyze,
}: CandidateInterviewRoadmapProps) {
  const [isCandidatePickerOpen, setIsCandidatePickerOpen] = useState(false);
  const [jobFilter, setJobFilter] = useState("all");
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const jobOptions = useMemo(
    () => [...new Set(candidates.map((item) => item.role).filter(Boolean))].sort(),
    [candidates],
  );
  const filteredCandidates = useMemo(
    () =>
      candidates.filter((item) => jobFilter === "all" || item.role === jobFilter),
    [candidates, jobFilter],
  );
  const newestTranscript = transcripts[0] ?? null;
  const selectedTranscript =
    transcripts.find((transcript) => transcript.id === selectedTranscriptId) ??
    newestTranscript;
  const hasCompleteTranscript = transcripts.some(
    (transcript) => transcript.status === "complete",
  );
  const analysisComplete = candidate?.interviewAnalysisStatus === "complete";
  const questionCount = (candidate?.interviewQuestions.length ?? 0) + (candidate?.followUpQuestions.length ?? 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="section-label">Roadmap razgovora</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">
              {candidate?.name ?? "Izberi kandidata"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {candidate
                ? `${candidate.role} · ${transcripts.length} shranjenih razgovorov`
                : "Vsak kandidat ima svoj sledljiv proces od priprave do odločitve."}
            </p>
          </div>

          <div className="grid min-w-[min(100%,36rem)] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.65fr)]">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Kandidat</span>
              <Popover open={isCandidatePickerOpen} onOpenChange={setIsCandidatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="justify-between gap-3 font-normal">
                    <span className="truncate">
                      {candidate ? `${candidate.name} · ${candidate.role}` : "Izberi kandidata"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-0">
                  <Command>
                    <CommandInput placeholder="Išči kandidata ali delovno mesto …" />
                    <CommandList className="max-h-80">
                      <CommandEmpty>Ni kandidatov v fazi Razgovor.</CommandEmpty>
                      <CommandGroup heading={`${filteredCandidates.length} kandidatov v fazi Razgovor`}>
                        {filteredCandidates.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.name} ${item.role}`}
                            onSelect={() => {
                              onCandidateChange(item.id);
                              setIsCandidatePickerOpen(false);
                            }}
                            className="py-2.5"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium">{item.name}</span>
                                {item.isNew ? (
                                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                    New
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {item.role}
                              </span>
                            </span>
                            {item.id === selectedCandidateId ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Delovno mesto</span>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vsa delovna mesta</SelectItem>
                  {jobOptions.map((jobTitle) => (
                    <SelectItem key={jobTitle} value={jobTitle}>
                      {jobTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <nav
        aria-label="Dejanja roadmapa"
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6"
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsCandidatePickerOpen(true)}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" /> Dodaj/izberi kandidata
        </Button>
        <Popover open={isQuestionsOpen} onOpenChange={setIsQuestionsOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={!candidate} className="gap-2"><Bot className="h-4 w-4"/>Vprašanja{questionCount ? ` (${questionCount})` : ""}</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-0">
            <div className="border-b border-border p-4"><h3 className="font-semibold text-foreground">Vprašanja za {candidate?.name}</h3><p className="mt-1 text-xs text-muted-foreground">Pripravljena vprašanja in nadaljnja vprašanja iz analize razgovora.</p></div>
            <div className="max-h-[60vh] space-y-5 overflow-y-auto p-4">
              <section><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pripravljena vprašanja</h4>{candidate?.interviewQuestions.length ? <ol className="mt-3 space-y-3">{candidate.interviewQuestions.map((question, index) => <li key={`${question}-${index}`} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm leading-relaxed"><span className="font-semibold text-primary">{index + 1}.</span><span>{question}</span></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">Vprašanja še niso pripravljena.</p>}</section>
              <section className="border-t border-border pt-4"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nadaljnja vprašanja</h4>{candidate?.followUpQuestions.length ? <ol className="mt-3 space-y-3">{candidate.followUpQuestions.map((question, index) => <li key={`${question}-${index}`} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm leading-relaxed"><span className="font-semibold text-cyan-600">{index + 1}.</span><span>{question}</span></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">Prikažejo se po analizi transkripta.</p>}</section>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          onClick={recordingStatus === "recording" || recordingStatus === "paused" ? onStop : onRecord}
          disabled={!candidate || recordingStatus === "ready"}
          className="gap-2"
        >
          <Mic className="h-4 w-4" />
          {recordingStatus === "recording" || recordingStatus === "paused"
            ? "Ustavi snemanje"
            : "Začni snemanje"}
        </Button>
        {recordingStatus === "ready" ? (
          <Button type="button" variant="outline" onClick={onSaveRecording} className="gap-2">
            <FileAudio className="h-4 w-4" /> Shrani posnetek
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onSaveRoadmap}
          disabled={!candidate || isSaving || !hasUnsavedChanges}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Shranjevanje …" : "Shrani roadmap"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onTranscribe}
          disabled={
            !selectedTranscript ||
            selectedTranscript.status !== "recorded" ||
            isTranscribing ||
            hasUnsavedChanges
          }
          className="gap-2"
          title={hasUnsavedChanges ? "Pred transkripcijo shrani roadmap." : undefined}
        >
          <FileText className="h-4 w-4" />
          {isTranscribing ? "Transkripcija …" : "Zaženi transkripcijo"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onAnalyze}
          disabled={!candidate || !hasCompleteTranscript || isAnalyzing || hasUnsavedChanges}
          className="gap-2"
          title={hasUnsavedChanges ? "Pred analizo shrani roadmap." : undefined}
        >
          <Sparkles className="h-4 w-4" />
          {isAnalyzing ? "Analiza …" : "Zaženi analizo"}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {hasUnsavedChanges ? "Neshranjene spremembe" : "Roadmap je shranjen"}
        </span>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 app-scrollbar sm:px-6 lg:px-10">
        {!candidate ? (
          <div className="mx-auto max-w-xl py-20 text-center">
            <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Izberi kandidata</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Roadmap se zgradi samodejno iz posnetkov, transkriptov in analize izbranega kandidata.
            </p>
          </div>
        ) : (
          <ol className="mx-auto max-w-5xl">
            <RoadmapStep
              title="Kandidat in priprava"
              description={`${candidate.name} · ${candidate.role}`}
              complete
              icon={<UserRound className="h-4 w-4" />}
            />
            <RoadmapStep
              title="Snemanje razgovora"
              description={
                recordingStatus === "recording"
                  ? "Snemanje trenutno poteka."
                  : transcripts.length
                    ? `${transcripts.length} posnetkov je pripetih temu kandidatu.`
                    : "Začni prvi razgovor iz zgornje vrstice dejanj."
              }
              complete={transcripts.length > 0}
              active={recordingStatus !== "idle"}
              icon={<Mic className="h-4 w-4" />}
            >
              {transcripts.length ? (
                <div className="mt-4 divide-y divide-border border-y border-border">
                  {transcripts.map((transcript) => (
                    <button
                      key={transcript.id}
                      type="button"
                      onClick={() => onSelectTranscript(transcript.id)}
                      className={`flex w-full items-center justify-between gap-4 px-1 py-3 text-left transition-colors hover:bg-muted/25 ${
                        selectedTranscript?.id === transcript.id ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{transcript.title}</span>
                        <span className="mt-0.5 block text-xs">
                          {new Date(transcript.createdAt).toLocaleDateString("sl-SI")} · {formatRoadmapDuration(transcript.durationSeconds)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium">
                        {transcriptStatusLabel[transcript.status]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </RoadmapStep>
            <RoadmapStep
              title="Transkript"
              description={
                hasCompleteTranscript
                  ? "Besedilo razgovora je pripravljeno za analizo."
                  : "Shrani roadmap in nato zaženi transkripcijo izbranega posnetka."
              }
              complete={hasCompleteTranscript}
              active={transcripts.some((transcript) => transcript.status === "processing")}
              icon={<FileText className="h-4 w-4" />}
            />
            <RoadmapStep
              title="CV + razgovor analiza"
              description={
                analysisComplete
                  ? "Analiza je zaključena in nadaljnja vprašanja so posodobljena."
                  : "Analizo lahko zaženeš, ko je transkript pripravljen in roadmap shranjen."
              }
              complete={analysisComplete}
              active={isAnalyzing}
              icon={<Bot className="h-4 w-4" />}
            />
            <RoadmapStep
              title="Odločitev in naslednja faza"
              description={`Trenutna faza: ${roadmapStageLabels[candidate.stage] ?? candidate.stage}. Pred spremembo faze mora biti roadmap shranjen.`}
              complete={candidate.stage === "Offer" || candidate.stage === "Accepted"}
              icon={<Check className="h-4 w-4" />}
              last
            />
          </ol>
        )}
      </div>
    </div>
  );
}

interface RoadmapStepProps {
  title: string;
  description: string;
  complete?: boolean;
  active?: boolean;
  last?: boolean;
  icon: ReactNode;
  children?: ReactNode;
}

function RoadmapStep({
  title,
  description,
  complete = false,
  active = false,
  last = false,
  icon,
  children,
}: RoadmapStepProps) {
  return (
    <li className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 pb-8">
      {!last ? <span className="absolute bottom-0 left-5 top-10 w-px bg-border" /> : null}
      <span
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border ${
          complete
            ? "border-emerald-500 bg-emerald-500 text-white"
            : active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground"
        }`}
      >
        {active && !complete ? <Circle className="h-3 w-3 fill-current animate-pulse" /> : icon}
      </span>
      <div className="min-w-0 pt-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {complete ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Zaključeno</span>
          ) : active ? (
            <span className="text-xs font-medium text-primary">V teku</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
    </li>
  );
}
