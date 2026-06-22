import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  Bot,
  Briefcase,
  Database,
  FileText,
  Info,
  Link2,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { CandidateInterviewRoadmap } from "../components/CandidateInterviewRoadmap";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { supabase } from "../lib/supabase";
import { checkTransition } from "../lib/candidateWorkflow";
import { useConfirm } from "../lib/confirm";
import { syncCandidateTranscriptLinks } from "../lib/interviewTranscriptLinks";

type StudioCandidate = {
  id: string;
  name: string;
  role: string;
  stage: CandidateStage;
  interviewQuestions: string[];
  followUpQuestions: string[];
  interviewAnalysisStatus?: string | null;
};

type CandidateStage = "Applied" | "Screening" | "Interview" | "Offer" | "Accepted" | "Rejected";

type StudioNodeType = "candidate" | "transcript";

type StudioNode = {
  id: string;
  type: StudioNodeType;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  candidateId?: string;
  transcriptId?: string;
  transcriptText?: string;
  scopeCandidateId?: string;
  scopeJobTitle?: string;
};

type StudioViewport = {
  x: number;
  y: number;
  zoom: number;
};

type StudioEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
};

type SavedTranscript = {
  id: string;
  title: string;
  transcriptText: string;
  durationSeconds: number;
  createdAt: string;
  status: "local" | "recorded" | "processing" | "complete" | "failed";
  audioPath?: string | null;
  errorMessage?: string | null;
};

type TranscriptRow = {
  id: string;
  title: string;
  transcript_text: string | null;
  duration_seconds: number | null;
  status: "recorded" | "processing" | "complete" | "failed";
  audio_path: string | null;
  error_message: string | null;
  created_at: string;
};

type CandidateRow = {
  id: string;
  full_name: string;
  job_title: string;
  stage: string | null;
  interview_questions?: unknown;
  interview_analysis_questions?: unknown;
  interview_analysis_status?: string | null;
};

type BoardRow = {
  id: string;
  nodes: unknown;
  edges: unknown;
  transcripts: unknown;
  viewport?: unknown;
  updated_at: string | null;
};

type BoardViewMode = "candidate" | "job" | "all";

const snapSize = 5;
const gridSize = 15;
const nodeWidth = 260;
const nodeCenterX = nodeWidth / 2;
const nodeCenterY = 58;
const canvasWorldWidth = 6400;
const canvasWorldHeight = 4200;
const minCanvasZoom = 0.35;
const maxCanvasZoom = 1.8;
const defaultViewport: StudioViewport = { x: -220, y: -110, zoom: 1 };
const maxRecordingSeconds = 60 * 60;
const warningSeconds = 30 * 60;
const maxAudioBytes = 25 * 1024 * 1024;
const recordingBitsPerSecond = 32_000;
const miniTranscribePricePerMinute = 0.003;
const defaultDeviceValue = "__default_microphone__";
const allViewValue = "__all__";
const maxTranscriptTranscriptConnections = 5;
const candidateStages: CandidateStage[] = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
];
const stageLabels: Record<CandidateStage, string> = {
  Applied: "Pripravljen",
  Screening: "Pregled",
  Interview: "Razgovor",
  Offer: "Ponudba",
  Accepted: "Sprejet",
  Rejected: "Zavrnjen",
};

const formatCandidateSubtitle = (candidate: Pick<StudioCandidate, "role" | "stage">) =>
  `${candidate.role} · ${stageLabels[candidate.stage]}`;

const isInterviewCandidate = (candidate: Pick<StudioCandidate, "stage">) =>
  candidate.stage === "Interview";

const snap = (value: number) => Math.round(value / snapSize) * snapSize;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const isMissingCandidateQuestionColumnError = (error: { message?: string; details?: string } | null) => {
  if (!error) return false;
  return (
    error.message?.includes("interview_questions") ||
    error.details?.includes("interview_questions") ||
    error.message?.includes("interview_analysis_questions") ||
    error.details?.includes("interview_analysis_questions")
  );
};

const getEdgeColor = (
  fromNode: StudioNode | undefined,
  toNode: StudioNode | undefined,
  selected: boolean,
) => {
  if (selected) return "#f59e0b";
  if (fromNode?.type === "transcript" && toNode?.type === "transcript") return "#ec4899";
  return "#2563eb";
};

const getEdgeMarkerId = (
  fromNode: StudioNode | undefined,
  toNode: StudioNode | undefined,
  selected: boolean,
) => {
  if (selected) return "url(#studio-arrow-selected)";
  if (fromNode?.type === "transcript" && toNode?.type === "transcript") {
    return "url(#studio-arrow-transcript)";
  }
  return "url(#studio-arrow-candidate)";
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${minutes}:${restSeconds.toString().padStart(2, "0")}`;
};

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const estimateRecordingBytes = (seconds: number) =>
  Math.ceil((Math.max(0, seconds) * recordingBitsPerSecond) / 8);

const estimateCost = (seconds: number) =>
  Math.max(0.01, (seconds / 60) * miniTranscribePricePerMinute);

const createTranscriptText = (title: string, durationSeconds: number) =>
  [
    `Transkript: ${title}`,
    `Trajanje posnetka: ${formatDuration(durationSeconds)}`,
    "",
    "To je testni transkript za preverjanje poteka v sistemu.",
    "V produkcijski različici bo ta vsebina nastala iz avdio posnetka prek transkripcijske edge funkcije.",
    "",
    "Ključne točke:",
    "- kandidat predstavi relevantne izkušnje za izbrano vlogo",
    "- manager lahko ročno poveže transkript z enim ali več kandidati",
    "- povezava je namenoma ročna, da se prepreči napačno samodejno pripisovanje razgovora",
  ].join("\n");

const recordingReadyText = (title: string, durationSeconds: number) =>
  [
    `Transkript: ${title}`,
    `Trajanje posnetka: ${formatDuration(durationSeconds)}`,
    "",
    "Posnetek je shranjen. Transkripcija še ni zagnana.",
    "Za zagon izberite ta transkript na mreži in kliknite Zaženi transkripcijo.",
  ].join("\n");

const isMissingBoardTableError = (error: { message?: string; details?: string }) =>
  error.message?.includes("interview_studio_boards") ||
  error.details?.includes("interview_studio_boards") ||
  error.message?.includes("Could not find the table");

const isMissingTranscriptTableError = (error: { message?: string; details?: string }) =>
  error.message?.includes("interview_transcripts") ||
  error.details?.includes("interview_transcripts") ||
  error.message?.includes("Could not find the table");

const normalizeNodes = (value: unknown): StudioNode[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      type: item.type === "candidate" ? "candidate" : "transcript",
      title: typeof item.title === "string" ? item.title : "Brez naslova",
      subtitle: typeof item.subtitle === "string" ? item.subtitle : "",
      x: typeof item.x === "number" ? snap(item.x) : 120,
      y: typeof item.y === "number" ? snap(item.y) : 120,
      candidateId: typeof item.candidateId === "string" ? item.candidateId : undefined,
      transcriptId: typeof item.transcriptId === "string" ? item.transcriptId : undefined,
      transcriptText:
        typeof item.transcriptText === "string" ? item.transcriptText : undefined,
      scopeCandidateId:
        typeof item.scopeCandidateId === "string" ? item.scopeCandidateId : undefined,
      scopeJobTitle:
        typeof item.scopeJobTitle === "string" ? item.scopeJobTitle : undefined,
    }));
};

const normalizeEdges = (value: unknown): StudioEdge[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => typeof item.fromNodeId === "string" && typeof item.toNodeId === "string")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      fromNodeId: item.fromNodeId as string,
      toNodeId: item.toNodeId as string,
    }));
};

const normalizeViewport = (value: unknown): StudioViewport | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const zoom = Number(record.zoom);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    return null;
  }

  return {
    x,
    y,
    zoom: clamp(zoom, minCanvasZoom, maxCanvasZoom),
  };
};

const normalizeTranscripts = (value: unknown): SavedTranscript[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      title: typeof item.title === "string" ? item.title : "Brez naslova",
      transcriptText:
        typeof item.transcriptText === "string" ? item.transcriptText : "",
      durationSeconds:
        typeof item.durationSeconds === "number" ? item.durationSeconds : 0,
      createdAt:
        typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      status:
        item.status === "recorded" ||
        item.status === "processing" ||
        item.status === "complete" ||
        item.status === "failed"
          ? item.status
          : "local",
      audioPath: typeof item.audioPath === "string" ? item.audioPath : null,
      errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : null,
    }));
};

const transcriptFromRow = (row: TranscriptRow): SavedTranscript => ({
  id: row.id,
  title: row.title,
  transcriptText:
    row.transcript_text?.trim() ||
    recordingReadyText(row.title, Math.max(0, Math.round(row.duration_seconds ?? 0))),
  durationSeconds: Math.max(0, Math.round(row.duration_seconds ?? 0)),
  createdAt: row.created_at,
  status: row.status,
  audioPath: row.audio_path,
  errorMessage: row.error_message,
});

const getTranscriptStatusLabel = (transcript: Pick<SavedTranscript, "status">) =>
  transcript.status === "complete"
    ? "transkript zaključen"
    : transcript.status === "recorded"
      ? "posnetek pripravljen"
      : transcript.status === "processing"
        ? "transkripcija v teku"
        : transcript.status === "failed"
          ? "transkripcija ni uspela"
          : "lokalni transkript";

const buildCandidateNode = (
  candidate: StudioCandidate,
  index: number,
  options?: { scopeJobTitle?: string; x?: number; y?: number },
): StudioNode => ({
  id: `candidate-${candidate.id}-${crypto.randomUUID()}`,
  type: "candidate",
  title: candidate.name,
  subtitle: formatCandidateSubtitle(candidate),
  x: snap(options?.x ?? 180),
  y: snap(options?.y ?? 110 + index * 140),
  candidateId: candidate.id,
  scopeJobTitle: options?.scopeJobTitle,
});

const buildTranscriptNode = (
  transcript: SavedTranscript,
  index: number,
  options?: { scopeCandidateId?: string; scopeJobTitle?: string; x?: number; y?: number },
): StudioNode => ({
  id: `transcript-${transcript.id}-${crypto.randomUUID()}`,
  type: "transcript",
  title: transcript.title,
  subtitle: `${formatDuration(transcript.durationSeconds)} · ${getTranscriptStatusLabel(transcript)}`,
  x: snap(options?.x ?? 540 + index * 20),
  y: snap(options?.y ?? 170 + index * 20),
  transcriptId: transcript.id,
  transcriptText: transcript.transcriptText,
  scopeCandidateId: options?.scopeCandidateId,
  scopeJobTitle: options?.scopeJobTitle,
});

const getCandidateTranscriptPairFromEdge = (
  edge: StudioEdge,
  nodeById: Map<string, StudioNode>,
) => {
  const left = nodeById.get(edge.fromNodeId);
  const right = nodeById.get(edge.toNodeId);
  const candidateNode =
    left?.type === "candidate" ? left : right?.type === "candidate" ? right : null;
  const transcriptNode =
    left?.type === "transcript" ? left : right?.type === "transcript" ? right : null;

  if (!candidateNode?.candidateId || !transcriptNode?.transcriptId) return null;

  return {
    candidateId: candidateNode.candidateId,
    candidateNodeId: candidateNode.id,
    transcriptId: transcriptNode.transcriptId,
    transcriptNodeId: transcriptNode.id,
    transcriptTitle: transcriptNode.title,
  };
};

const getTranscriptTranscriptPairFromEdge = (
  edge: StudioEdge,
  nodeById: Map<string, StudioNode>,
) => {
  const left = nodeById.get(edge.fromNodeId);
  const right = nodeById.get(edge.toNodeId);

  if (
    left?.type !== "transcript" ||
    right?.type !== "transcript" ||
    !left.transcriptId ||
    !right.transcriptId
  ) {
    return null;
  }

  return {
    leftTranscriptId: left.transcriptId,
    rightTranscriptId: right.transcriptId,
  };
};

const keepValidStudioEdges = (
  inputEdges: StudioEdge[],
  inputNodes: StudioNode[],
) => {
  const nodeById = new Map(inputNodes.map((node) => [node.id, node]));
  const candidateByTranscriptId = new Map<string, string>();
  const transcriptTranscriptKeys = new Set<string>();
  const transcriptTranscriptCounts = new Map<string, number>();
  const keptEdges: StudioEdge[] = [];
  const candidateTranscriptPairs: Array<{ candidateId: string; transcriptId: string }> = [];
  const removedEdges: StudioEdge[] = [];
  const conflicts: Array<{ transcriptId: string; transcriptTitle: string }> = [];

  for (const edge of inputEdges) {
    const left = nodeById.get(edge.fromNodeId);
    const right = nodeById.get(edge.toNodeId);
    if (left?.type === "candidate" && right?.type === "candidate") {
      removedEdges.push(edge);
      continue;
    }

    const pair = getCandidateTranscriptPairFromEdge(edge, nodeById);

    if (pair) {
      const existingCandidateId = candidateByTranscriptId.get(pair.transcriptId);

      if (existingCandidateId) {
        removedEdges.push(edge);
        if (existingCandidateId !== pair.candidateId) {
          conflicts.push({
            transcriptId: pair.transcriptId,
            transcriptTitle: pair.transcriptTitle,
          });
        }
        continue;
      }

      candidateByTranscriptId.set(pair.transcriptId, pair.candidateId);
      candidateTranscriptPairs.push({
        candidateId: pair.candidateId,
        transcriptId: pair.transcriptId,
      });
      keptEdges.push(edge);
      continue;
    }

    const transcriptPair = getTranscriptTranscriptPairFromEdge(edge, nodeById);

    if (transcriptPair) {
      const { leftTranscriptId, rightTranscriptId } = transcriptPair;
      const pairKey = [leftTranscriptId, rightTranscriptId].sort().join(":");
      const leftCount = transcriptTranscriptCounts.get(leftTranscriptId) ?? 0;
      const rightCount = transcriptTranscriptCounts.get(rightTranscriptId) ?? 0;

      if (
        leftTranscriptId === rightTranscriptId ||
        transcriptTranscriptKeys.has(pairKey) ||
        leftCount >= maxTranscriptTranscriptConnections ||
        rightCount >= maxTranscriptTranscriptConnections
      ) {
        removedEdges.push(edge);
        continue;
      }

      transcriptTranscriptKeys.add(pairKey);
      transcriptTranscriptCounts.set(leftTranscriptId, leftCount + 1);
      transcriptTranscriptCounts.set(rightTranscriptId, rightCount + 1);
      keptEdges.push(edge);
      continue;
    }

    keptEdges.push(edge);
  }

  return { keptEdges, candidateTranscriptPairs, removedEdges, conflicts };
};

function NodeCard({
  node,
  hasConnectionStart,
  isConnecting,
  selected,
  onPointerDown,
  onConnectStart,
  onConnectEnd,
  onOpenDetails,
}: {
  node: StudioNode;
  hasConnectionStart: boolean;
  isConnecting: boolean;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onConnectStart: () => void;
  onConnectEnd: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <div
      data-studio-node="true"
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        event.stopPropagation();
        onOpenDetails();
      }}
      className={`absolute w-[260px] cursor-grab rounded-md border bg-card p-4 text-card-foreground shadow-sm transition active:cursor-grabbing ${
        selected ? "border-ring ring-2 ring-ring/30" : "border-border"
      }`}
      style={{ left: node.x, top: node.y }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-md ${
                node.type === "candidate"
                  ? "bg-cyan-500/10 text-cyan-500"
                  : "bg-violet-500/10 text-violet-500"
              }`}
            >
              {node.type === "candidate" ? (
                <Users className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{node.title}</p>
              <p className="truncate text-xs text-muted-foreground">{node.subtitle}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
            isConnecting
              ? "border-ring bg-muted text-foreground"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            if (hasConnectionStart) onConnectEnd();
            else onConnectStart();
          }}
        >
          <Link2 className="mr-1 inline h-3.5 w-3.5" />
          Poveži
        </button>
      </div>
      {node.type === "transcript" && node.transcriptText ? (
        <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {node.transcriptText}
        </p>
      ) : null}
    </div>
  );
}

const formatReaderDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

// Default Studio view: a focused, readable two-pane transcript reader. The
// network canvas ("Mreža") is an opt-in toggle, not the entry point.
function TranscriptReader({
  transcripts,
  candidateByTranscriptId,
  onOpenCandidate,
  onOpenMap,
}: {
  transcripts: SavedTranscript[];
  candidateByTranscriptId: Map<string, StudioCandidate>;
  onOpenCandidate: (candidateId: string) => void;
  onOpenMap: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(transcripts[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<"none" | "loading" | "ready" | "error">("none");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? transcripts.filter((transcript) =>
        `${transcript.title} ${transcript.transcriptText}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : transcripts;
  const selected =
    transcripts.find((transcript) => transcript.id === selectedId) ?? transcripts[0] ?? null;
  const selectedAudioPath = selected?.audioPath ?? null;
  const selectedCandidate = selected ? candidateByTranscriptId.get(selected.id) ?? null : null;

  // Fetch a fresh signed URL for the selected recording so it can be played inline.
  useEffect(() => {
    let active = true;
    setAudioUrl(null);
    if (!selectedAudioPath) {
      setAudioState("none");
      return;
    }
    setAudioState("loading");
    void supabase.storage
      .from("interview-recordings")
      .createSignedUrl(selectedAudioPath, 60 * 30)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setAudioState("error");
          return;
        }
        setAudioUrl(data.signedUrl);
        setAudioState("ready");
      });
    return () => {
      active = false;
    };
  }, [selectedAudioPath]);

  if (!transcripts.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Ni transkriptov za branje</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Posnemite ali naložite razgovor, ali ga dodajte na mrežo, da se prikaže tukaj.
        </p>
        <Button type="button" variant="outline" onClick={onOpenMap}>
          Odpri mrežo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Transcript list + search */}
      <div className="flex max-h-[30dvh] w-full shrink-0 flex-col border-b border-border lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Išči po transkriptih..."
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-muted/30"
          />
        </div>
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {filtered.map((transcript) => (
            <button
              key={transcript.id}
              type="button"
              onClick={() => setSelectedId(transcript.id)}
              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 ${
                selected?.id === transcript.id ? "bg-accent/50" : ""
              }`}
            >
              <span className="line-clamp-1 text-sm font-medium text-foreground">
                {transcript.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatReaderDuration(transcript.durationSeconds)} · {transcript.status}
                {transcript.audioPath ? " · posnetek" : ""}
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Ni zadetkov.</div>
          ) : null}
        </div>
      </div>

      {/* Readable transcript */}
      <div className="flex min-h-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {selected.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {formatReaderDuration(selected.durationSeconds)} · {selected.status}
                  {selected.audioPath ? " · posnetek na voljo" : " · brez posnetka"}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onOpenMap}>
                Odpri na mreži
              </Button>
            </div>
            {selectedAudioPath ? (
              <div className="border-b border-border px-4 py-3">
                {audioState === "ready" && audioUrl ? (
                  <audio controls src={audioUrl} className="w-full" />
                ) : audioState === "loading" ? (
                  <p className="text-xs text-muted-foreground">Nalaganje posnetka…</p>
                ) : audioState === "error" ? (
                  <p className="text-xs text-muted-foreground">Posnetka ni bilo mogoče naložiti.</p>
                ) : null}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selected.transcriptText.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {selected.transcriptText}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Transkript še nima besedila.</p>
              )}
            </div>
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Časovne oznake in oznake govorcev bodo na voljo, ko prepis vrne segmente.
            </div>
          </>
        ) : null}
      </div>

      {/* Candidate-scoped insights for the selected transcript */}
      {selectedCandidate ? (
        <aside className="flex max-h-[40dvh] w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-border p-4 lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kandidat
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{selectedCandidate.name}</p>
            <p className="text-xs text-muted-foreground">{selectedCandidate.role}</p>
          </div>
          <Button type="button" size="sm" onClick={() => onOpenCandidate(selectedCandidate.id)}>
            Odpri analizo kandidata →
          </Button>
          {selectedCandidate.interviewQuestions.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vprašanja za razgovor
              </p>
              <ol className="mt-1.5 space-y-1.5 text-sm text-foreground">
                {selectedCandidate.interviewQuestions.map((question, index) => (
                  <li key={`${question}-${index}`}>
                    {index + 1}. {question}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {selectedCandidate.followUpQuestions.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nadaljnja vprašanja
              </p>
              <ul className="mt-1.5 space-y-1.5 text-sm text-foreground">
                {selectedCandidate.followUpQuestions.map((question, index) => (
                  <li key={`${question}-${index}`}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

export default function InterviewStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const initialCandidateId = searchParams.get("candidateId") ?? "";
  const initialJobTitle = searchParams.get("jobTitle") ?? "";
  const initialTranscriptId = searchParams.get("transcriptId") ?? "";
  const [candidates, setCandidates] = useState<StudioCandidate[]>([]);
  const [nodes, setNodes] = useState<StudioNode[]>([]);
  const [edges, setEdges] = useState<StudioEdge[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [boardTableMissing, setBoardTableMissing] = useState(false);
  const [transcriptTableMissing, setTranscriptTableMissing] = useState(false);
  const [dragState, setDragState] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [panState, setPanState] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [viewport, setViewport] = useState(defaultViewport);
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>(
    initialCandidateId ? "candidate" : initialJobTitle ? "job" : "all",
  );
  // Candidate roadmap is the primary workflow. Reader and free canvas remain
  // available as supporting and advanced views.
  const [studioView, setStudioView] = useState<"roadmap" | "reader" | "map">("roadmap");
  const [selectedCandidateId, setSelectedCandidateId] = useState(initialCandidateId);
  const [selectedJobTitle, setSelectedJobTitle] = useState(initialJobTitle);
  const [pendingTranscriptNodeId, setPendingTranscriptNodeId] = useState(initialTranscriptId);
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(
    Boolean(initialCandidateId || initialJobTitle),
  );
  const [candidateStageDraft, setCandidateStageDraft] = useState<CandidateStage>("Screening");
  const [isSavingCandidateStage, setIsSavingCandidateStage] = useState(false);
  const [isAnalyzingCandidate, setIsAnalyzingCandidate] = useState(false);
  const [savedBoardSnapshot, setSavedBoardSnapshot] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<"idle" | "recording" | "paused" | "ready">("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [isCandidatePickerOpen, setIsCandidatePickerOpen] = useState(false);
  const [isTranscriptPickerOpen, setIsTranscriptPickerOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pinnedQuestionCandidateId, setPinnedQuestionCandidateId] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingBlobRef = useRef<Blob | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hasAppliedInitialViewportRef = useRef(false);
  const currentBoardSnapshot = useMemo(
    () => JSON.stringify({ nodes, edges, transcripts: savedTranscripts, viewport }),
    [edges, nodes, savedTranscripts, viewport],
  );
  const hasUnsavedChanges =
    savedBoardSnapshot !== null && currentBoardSnapshot !== savedBoardSnapshot;

  useEffect(() => {
    if (!isLoadingBoard && savedBoardSnapshot === null) {
      setSavedBoardSnapshot(currentBoardSnapshot);
    }
  }, [currentBoardSnapshot, isLoadingBoard, savedBoardSnapshot]);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      const [candidateResult, { data: userResult }] = await Promise.all([
        supabase
        .from("candidates")
        .select("id, full_name, job_title, stage, interview_questions, interview_analysis_questions, interview_analysis_status")
        .order("created_at", { ascending: false })
          .limit(80),
        supabase.auth.getUser(),
      ]);
      let candidateRows = candidateResult.data as CandidateRow[] | null;
      let candidateError = candidateResult.error;

      if (!isMounted) return;

      if (isMissingCandidateQuestionColumnError(candidateError)) {
        const fallbackResult = await supabase
          .from("candidates")
          .select("id, full_name, job_title, stage")
          .order("created_at", { ascending: false })
          .limit(80);

        if (!isMounted) return;
        candidateRows = fallbackResult.data as CandidateRow[] | null;
        candidateError = fallbackResult.error;
      }

      if (candidateError) {
        setMessage(`Kandidatov ni bilo mogoče naložiti: ${candidateError.message}`);
      }

      setCandidates(
        ((candidateRows ?? []) as CandidateRow[]).map(
          (candidate) => ({
            id: candidate.id,
            name: candidate.full_name,
            role: candidate.job_title,
            stage: candidateStages.includes(candidate.stage as CandidateStage)
              ? (candidate.stage as CandidateStage)
              : "Applied",
            interviewQuestions: normalizeStringList(candidate.interview_questions),
            followUpQuestions: normalizeStringList(candidate.interview_analysis_questions),
            interviewAnalysisStatus: candidate.interview_analysis_status,
          }),
        ),
      );

      const userId = userResult.user?.id;
      if (!userId) {
        setIsLoadingBoard(false);
        setMessage("Za shranjevanje mreže morate biti prijavljeni.");
        return;
      }

      let boardResult = await supabase
        .from("interview_studio_boards")
        .select("id, nodes, edges, transcripts, viewport, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      const shouldRetryWithoutViewport =
        boardResult.error &&
        (boardResult.error.message?.includes("viewport") ||
          boardResult.error.details?.includes("viewport"));

      if (shouldRetryWithoutViewport) {
        boardResult = await supabase
          .from("interview_studio_boards")
          .select("id, nodes, edges, transcripts, updated_at")
          .eq("user_id", userId)
          .maybeSingle();
      }

      const { data: board, error } = boardResult;

      if (!isMounted) return;

      if (error) {
        setIsLoadingBoard(false);
        if (isMissingBoardTableError(error)) {
          setBoardTableMissing(true);
          setMessage("Tabela za shranjevanje razgovorov še ni ustvarjena. SQL je dodan v docs.");
        } else {
          setMessage(`Mreže ni bilo mogoče naložiti: ${error.message}`);
        }
        return;
      }

      if (board) {
        const boardRow = board as BoardRow;
        setBoardId(board.id);
        setNodes(normalizeNodes(boardRow.nodes));
        setEdges(normalizeEdges(boardRow.edges));
        setSavedTranscripts(normalizeTranscripts(boardRow.transcripts));
        const savedViewport = normalizeViewport(boardRow.viewport);
        if (savedViewport) {
          setViewport(savedViewport);
          hasAppliedInitialViewportRef.current = true;
        }
        setLastSavedAt(boardRow.updated_at ?? null);
      }

      const { data: transcriptRows, error: transcriptError } = await supabase
        .from("interview_transcripts")
        .select("id, title, transcript_text, duration_seconds, status, audio_path, error_message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60);

      if (!isMounted) return;

      if (transcriptError) {
        if (isMissingTranscriptTableError(transcriptError)) {
          setTranscriptTableMissing(true);
        } else {
          setMessage(`Transkriptov ni bilo mogoče naložiti: ${transcriptError.message}`);
        }
      } else {
        setTranscriptTableMissing(false);
        const rows = (transcriptRows ?? []) as TranscriptRow[];
        const persistedTranscripts = rows.map(transcriptFromRow);
        if (persistedTranscripts.length) {
          setSavedTranscripts((current) => {
            const existing = new Map(current.map((item) => [item.id, item]));
            for (const transcript of persistedTranscripts) {
              existing.set(transcript.id, transcript);
            }
            return Array.from(existing.values()).sort(
              (first, second) =>
                new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
            );
          });
        }
      }

      setIsLoadingBoard(false);
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const nextDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = nextDevices.filter((device) => device.kind === "audioinput");
      setDevices(audioInputs);
      setSelectedDeviceId((current) => current || audioInputs[0]?.deviceId || "");
    };

    loadDevices().catch(() => {
      setMessage("Mikrofonov ni bilo mogoče prebrati. Preverite dovoljenja brskalnika.");
    });
  }, []);

  useEffect(() => {
    if (recordingStatus !== "recording") return;

    const timer = window.setInterval(() => {
      setDurationSeconds((current) => {
        if (current + 1 >= maxRecordingSeconds) {
          recorder?.stop();
          setRecordingStatus("ready");
          setMessage("Dosežena je bila največja dovoljena dolžina posnetka.");
          return maxRecordingSeconds;
        }
        return current + 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recorder, recordingStatus]);

  useEffect(() => {
    const nextParams = new URLSearchParams();

    if (viewMode === "candidate" && selectedCandidateId) {
      nextParams.set("mode", "candidate");
      nextParams.set("candidateId", selectedCandidateId);
    } else if (viewMode === "job" && selectedJobTitle) {
      nextParams.set("mode", "job");
      nextParams.set("jobTitle", selectedJobTitle);
    }

    setSearchParams(nextParams, { replace: true });
  }, [selectedCandidateId, selectedJobTitle, setSearchParams, viewMode]);

  const getCenteredViewport = (zoom = 0.75): StudioViewport => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1200;
    const height = rect?.height ?? 720;
    const nextZoom = clamp(zoom, minCanvasZoom, maxCanvasZoom);

    return {
      x: width / 2 - (canvasWorldWidth / 2) * nextZoom,
      y: height / 2 - (canvasWorldHeight / 2) * nextZoom,
      zoom: nextZoom,
    };
  };

  const getFitViewport = (items: StudioNode[], fallbackZoom = 1): StudioViewport => {
    if (!items.length) return getCenteredViewport(fallbackZoom);

    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1200;
    const height = rect?.height ?? 720;
    const minX = Math.min(...items.map((node) => node.x));
    const minY = Math.min(...items.map((node) => node.y));
    const maxX = Math.max(...items.map((node) => node.x + nodeWidth));
    const maxY = Math.max(...items.map((node) => node.y + 150));
    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const padding = 160;
    const fitZoom = clamp(
      Math.min(width / (boundsWidth + padding * 2), height / (boundsHeight + padding * 2)),
      minCanvasZoom,
      Math.min(1.15, maxCanvasZoom),
    );

    return {
      x: width / 2 - ((minX + maxX) / 2) * fitZoom,
      y: height / 2 - ((minY + maxY) / 2) * fitZoom,
      zoom: fitZoom,
    };
  };

  const getVisibleWorldCenter = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return {
        x: canvasWorldWidth / 2,
        y: canvasWorldHeight / 2,
      };
    }

    return {
      x: (rect.width / 2 - viewport.x) / viewport.zoom,
      y: (rect.height / 2 - viewport.y) / viewport.zoom,
    };
  };

  const getNodeDropPosition = (index = 0) => {
    const center = getVisibleWorldCenter();
    return {
      x: clamp(snap(center.x - nodeWidth / 2 + index * 24), 20, canvasWorldWidth - nodeWidth - 20),
      y: clamp(snap(center.y - nodeCenterY + index * 24), 20, canvasWorldHeight - 160),
    };
  };

  const jobTitles = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.role).filter(Boolean))].sort(),
    [candidates],
  );

  // Map each transcript to the candidate it is linked to on the board, so the
  // reader can show candidate-scoped insights without leaving the page.
  const transcriptCandidateMap = useMemo(() => {
    const map = new Map<string, StudioCandidate>();
    const candidateNodeById = new Map(
      nodes.filter((node) => node.type === "candidate").map((node) => [node.id, node]),
    );
    const transcriptNodeById = new Map(
      nodes.filter((node) => node.type === "transcript").map((node) => [node.id, node]),
    );
    for (const edge of edges) {
      const candidateNode =
        candidateNodeById.get(edge.fromNodeId) ?? candidateNodeById.get(edge.toNodeId);
      const transcriptNode =
        transcriptNodeById.get(edge.fromNodeId) ?? transcriptNodeById.get(edge.toNodeId);
      if (candidateNode?.candidateId && transcriptNode?.transcriptId) {
        const candidate = candidates.find((item) => item.id === candidateNode.candidateId);
        if (candidate) map.set(transcriptNode.transcriptId, candidate);
      }
    }
    for (const transcriptNode of transcriptNodeById.values()) {
      if (!transcriptNode.transcriptId || !transcriptNode.scopeCandidateId) continue;
      const candidate = candidates.find(
        (item) => item.id === transcriptNode.scopeCandidateId,
      );
      if (candidate && !map.has(transcriptNode.transcriptId)) {
        map.set(transcriptNode.transcriptId, candidate);
      }
    }
    return map;
  }, [nodes, edges, candidates]);

  const interviewCandidates = useMemo(() => {
    const seen = new Set<string>();
    const candidatesWithTranscript = new Set(
      Array.from(transcriptCandidateMap.values()).map((candidate) => candidate.id),
    );

    return candidates
      .filter((candidate) => candidate.stage === "Interview")
      .filter((candidate) => {
        const key = `${candidate.name.trim().toLowerCase()}::${candidate.role.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((candidate) => ({
        ...candidate,
        isNew: !candidatesWithTranscript.has(candidate.id),
      }));
  }, [candidates, transcriptCandidateMap]);

  useEffect(() => {
    if (!selectedJobTitle && viewMode === "job" && jobTitles.length) {
      setSelectedJobTitle(jobTitles[0]);
    }
  }, [jobTitles, selectedJobTitle, viewMode]);

  const visibleCandidateIds = useMemo(() => {
    if (viewMode === "candidate") {
      return new Set(selectedCandidateId ? [selectedCandidateId] : []);
    }

    if (viewMode === "job") {
      return new Set(
        candidates
          .filter(
            (candidate) =>
              candidate.role === selectedJobTitle && isInterviewCandidate(candidate),
          )
          .map((candidate) => candidate.id),
      );
    }

    return new Set(candidates.map((candidate) => candidate.id));
  }, [candidates, selectedCandidateId, selectedJobTitle, viewMode]);

  const visibleNodes = useMemo(() => {
    if (viewMode === "all") return nodes;

    const candidateNodeIds = new Set(
      nodes
        .filter((node) => node.type === "candidate" && node.candidateId && visibleCandidateIds.has(node.candidateId))
        .map((node) => node.id),
    );
    const transcriptNodeIds = new Set<string>();

    for (const edge of edges) {
      const leftIsVisibleCandidate = candidateNodeIds.has(edge.fromNodeId);
      const rightIsVisibleCandidate = candidateNodeIds.has(edge.toNodeId);
      if (leftIsVisibleCandidate) transcriptNodeIds.add(edge.toNodeId);
      if (rightIsVisibleCandidate) transcriptNodeIds.add(edge.fromNodeId);
    }

    return nodes.filter((node) => {
      if (node.type === "candidate") {
        return Boolean(node.candidateId && visibleCandidateIds.has(node.candidateId));
      }

      if (transcriptNodeIds.has(node.id) || selectedNodeId === node.id || detailNodeId === node.id) {
        return true;
      }

      if (viewMode === "candidate") {
        return Boolean(node.scopeCandidateId && node.scopeCandidateId === selectedCandidateId);
      }

      if (viewMode === "job") {
        return Boolean(node.scopeJobTitle && node.scopeJobTitle === selectedJobTitle);
      }

      return false;
    });
  }, [detailNodeId, edges, nodes, selectedCandidateId, selectedJobTitle, selectedNodeId, viewMode, visibleCandidateIds]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId),
      ),
    [edges, visibleNodeIds],
  );

  useEffect(() => {
    if (isLoadingBoard || hasAppliedInitialViewportRef.current) return;

    setViewport(nodes.length ? getFitViewport(visibleNodes) : getCenteredViewport());
    hasAppliedInitialViewportRef.current = true;
  }, [isLoadingBoard, nodes.length, visibleNodes]);

  const nodeCenters = useMemo(
    () =>
      new Map(
        visibleNodes.map((node) => [
          node.id,
          {
            x: node.x + nodeCenterX,
            y: node.y + nodeCenterY,
          },
        ]),
      ),
    [visibleNodes],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const selectedTranscript = useMemo(() => {
    if (selectedNode?.type !== "transcript" || !selectedNode.transcriptId) return null;
    return savedTranscripts.find((transcript) => transcript.id === selectedNode.transcriptId) ?? null;
  }, [savedTranscripts, selectedNode]);

  const detailNode = useMemo(
    () => nodes.find((node) => node.id === detailNodeId) ?? null,
    [detailNodeId, nodes],
  );

  const detailTranscript = useMemo(() => {
    if (detailNode?.type !== "transcript" || !detailNode.transcriptId) return null;
    return savedTranscripts.find((transcript) => transcript.id === detailNode.transcriptId) ?? null;
  }, [detailNode, savedTranscripts]);

  const detailCandidate = useMemo(() => {
    if (detailNode?.type !== "candidate" || !detailNode.candidateId) return null;
    return candidates.find((candidate) => candidate.id === detailNode.candidateId) ?? null;
  }, [candidates, detailNode]);

  const pinnedQuestionCandidate = useMemo(
    () =>
      pinnedQuestionCandidateId
        ? candidates.find((candidate) => candidate.id === pinnedQuestionCandidateId) ?? null
        : null,
    [candidates, pinnedQuestionCandidateId],
  );

  const detailCandidateQuestionCount =
    (detailCandidate?.interviewQuestions.length ?? 0) +
    (detailCandidate?.followUpQuestions.length ?? 0);

  const pinCandidateQuestions = (candidate: StudioCandidate) => {
    setPinnedQuestionCandidateId(candidate.id);
    setDetailNodeId(null);
    setMessage(`Vprašanja za ${candidate.name} so pripeta pod Mreža.`);
  };

  const activeRecordingCandidate = useMemo(() => {
    if (viewMode === "candidate" && selectedCandidateId) {
      return interviewCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
    }

    if (selectedNode?.type === "candidate" && selectedNode.candidateId) {
      return interviewCandidates.find((candidate) => candidate.id === selectedNode.candidateId) ?? null;
    }

    const visibleCandidateNodes = visibleNodes.filter((node) => node.type === "candidate");
    if (visibleCandidateNodes.length === 1 && visibleCandidateNodes[0].candidateId) {
      return (
        interviewCandidates.find((candidate) => candidate.id === visibleCandidateNodes[0].candidateId) ??
        null
      );
    }

    return null;
  }, [interviewCandidates, selectedCandidateId, selectedNode, viewMode, visibleNodes]);

  const getCandidateInterviewCount = (candidateId: string) => {
    const candidateNodeIds = new Set(
      nodes
        .filter((node) => node.type === "candidate" && node.candidateId === candidateId)
        .map((node) => node.id),
    );
    const transcriptIds = new Set<string>();

    for (const edge of edges) {
      const transcriptNodeId = candidateNodeIds.has(edge.fromNodeId)
        ? edge.toNodeId
        : candidateNodeIds.has(edge.toNodeId)
          ? edge.fromNodeId
          : "";
      if (!transcriptNodeId) continue;

      const transcriptNode = nodes.find((node) => node.id === transcriptNodeId);
      if (transcriptNode?.transcriptId) transcriptIds.add(transcriptNode.transcriptId);
    }

    nodes
      .filter((node) => node.type === "transcript" && node.scopeCandidateId === candidateId)
      .forEach((node) => {
        if (node.transcriptId) transcriptIds.add(node.transcriptId);
      });

    return transcriptIds.size;
  };

  const defaultRecordingTitle = useMemo(() => {
    if (!activeRecordingCandidate) return "Razgovor 1";
    return `${activeRecordingCandidate.name} razgovor ${
      getCandidateInterviewCount(activeRecordingCandidate.id) + 1
    }`;
  }, [activeRecordingCandidate, edges, nodes]);

  useEffect(() => {
    if (isLoadingBoard || !candidates.length) return;

    if (viewMode === "candidate" && selectedCandidateId) {
      const candidate = candidates.find((item) => item.id === selectedCandidateId);
      if (!candidate) return;

      const existingNode = nodes.find((node) => node.candidateId === candidate.id);
      if (existingNode) return;

      const position = getNodeDropPosition();
      const candidateNode = buildCandidateNode(candidate, 0, {
        scopeJobTitle: candidate.role,
        ...position,
      });
      setNodes((current) => [candidateNode, ...current]);
      setSelectedNodeId(candidateNode.id);
      setMessage("Kandidat je dodan v pogled. Dodajte ali izberite transkript in ga povežite.");
      return;
    }

    if (viewMode === "job" && selectedJobTitle) {
      const jobCandidates = candidates.filter(
        (candidate) =>
          candidate.role === selectedJobTitle && isInterviewCandidate(candidate),
      );
      const existingCandidateIds = new Set(
        nodes
          .filter((node) => node.type === "candidate" && node.candidateId)
          .map((node) => node.candidateId as string),
      );
      const missingCandidates = jobCandidates.filter(
        (candidate) => !existingCandidateIds.has(candidate.id),
      );

      if (!missingCandidates.length) return;

      const center = getVisibleWorldCenter();
      const startY = center.y - ((missingCandidates.length - 1) * 170) / 2;
      setNodes((current) => [
        ...current,
        ...missingCandidates.map((candidate, index) =>
          buildCandidateNode(candidate, current.length + index, {
            scopeJobTitle: selectedJobTitle,
            x: center.x - nodeWidth / 2,
            y: startY + index * 170,
          }),
        ),
      ]);
      setMessage("Kandidati v fazi razgovora za izbrano delovno mesto so dodani na mrežo.");
    }
  }, [candidates, isLoadingBoard, nodes, selectedCandidateId, selectedJobTitle, viewMode]);

  useEffect(() => {
    if (isLoadingBoard || !pendingTranscriptNodeId) return;

    const transcript = savedTranscripts.find((item) => item.id === pendingTranscriptNodeId);
    if (!transcript) return;

    const existingNode = nodes.find((node) => node.transcriptId === transcript.id);
    if (existingNode) {
      setSelectedNodeId(existingNode.id);
      setPendingTranscriptNodeId("");
      return;
    }

    const transcriptNode = buildTranscriptNode(transcript, visibleNodes.length + 1, {
      scopeCandidateId: viewMode === "candidate" ? selectedCandidateId : undefined,
      scopeJobTitle: viewMode === "job" ? selectedJobTitle : undefined,
      ...getNodeDropPosition(1),
    });
    setNodes((current) => [...current, transcriptNode]);
    setSelectedNodeId(transcriptNode.id);
    setSelectedEdgeId(null);
    setPendingTranscriptNodeId("");
    setMessage("Transkript je dodan v pogled. Povežite ga s kandidatom in shranite mrežo.");
  }, [
    isLoadingBoard,
    nodes,
    pendingTranscriptNodeId,
    savedTranscripts,
    selectedCandidateId,
    selectedJobTitle,
    viewMode,
    visibleNodes.length,
  ]);

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (selectedEdgeId && !visibleEdges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, selectedNodeId, visibleEdges, visibleNodeIds]);

  useEffect(() => {
    if (detailCandidate) {
      setCandidateStageDraft(detailCandidate.stage);
    }
  }, [detailCandidate]);

  useEffect(() => {
    if (pinnedQuestionCandidateId && !pinnedQuestionCandidate) {
      setPinnedQuestionCandidateId(null);
    }
  }, [pinnedQuestionCandidate, pinnedQuestionCandidateId]);

  const candidatePickerOptions = useMemo(() => {
    if (viewMode === "job" && selectedJobTitle) {
      return interviewCandidates.filter(
        (candidate) => candidate.role === selectedJobTitle,
      );
    }

    return interviewCandidates;
  }, [interviewCandidates, selectedJobTitle, viewMode]);

  const saveBoard = async () => {
    setIsSavingBoard(true);
    setMessage(null);

    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;

    if (!userId) {
      setIsSavingBoard(false);
      setMessage("Za shranjevanje mreže morate biti prijavljeni.");
      return;
    }

    const {
      keptEdges,
      candidateTranscriptPairs,
      removedEdges,
    } = keepValidStudioEdges(edges, nodes);

    if (removedEdges.length) {
      setEdges(keptEdges);
    }

    let saveResult = await supabase
      .from("interview_studio_boards")
      .upsert(
        {
          id: boardId ?? undefined,
          user_id: userId,
          title: "Studio razgovorov",
          nodes,
          edges: keptEdges,
          transcripts: savedTranscripts,
          viewport,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id, updated_at")
      .single();
    const shouldRetryWithoutViewport =
      saveResult.error &&
      (saveResult.error.message?.includes("viewport") ||
        saveResult.error.details?.includes("viewport"));

    if (shouldRetryWithoutViewport) {
      saveResult = await supabase
        .from("interview_studio_boards")
        .upsert(
          {
            id: boardId ?? undefined,
            user_id: userId,
            title: "Studio razgovorov",
            nodes,
            edges: keptEdges,
            transcripts: savedTranscripts,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select("id, updated_at")
        .single();
    }

    const { data, error } = saveResult;

    setIsSavingBoard(false);

    if (error) {
      if (isMissingBoardTableError(error)) {
        setBoardTableMissing(true);
        setMessage("Tabela interview_studio_boards še ni v bazi. Za shranjevanje zaženite SQL iz docs.");
        return;
      }

      setMessage(`Shranjevanje mreže ni uspelo: ${error.message}`);
      return;
    }

    setBoardTableMissing(false);
    setBoardId(data.id);
    setLastSavedAt(data.updated_at ?? new Date().toISOString());
    setSavedBoardSnapshot(
      JSON.stringify({ nodes, edges: keptEdges, transcripts: savedTranscripts, viewport }),
    );

    const linkResult = await syncCandidateTranscriptLinks({
      userId,
      candidateTranscriptPairs,
    });

    if (linkResult.missingTable) {
      setMessage(
        "Mreža razgovorov je shranjena. Za samodejni prikaz transkriptov pri kandidatu zaženite še SQL za candidate_interview_transcripts.",
      );
      return;
    }

    if (!linkResult.ok) {
      setMessage(
        `Mreža je shranjena, vezava transkriptov na kandidata pa ni uspela: ${linkResult.error?.message}`,
      );
      return;
    }

    setMessage(
      removedEdges.length
        ? `Mreža je shranjena. Odstranjenih je bilo ${removedEdges.length} podvojenih ali nedovoljenih povezav. En transkript je lahko vezan samo na enega kandidata, med transkripti pa ima lahko največ ${maxTranscriptTranscriptConnections} povezav.`
        : "Mreža razgovorov je shranjena, transkripti pa so vezani na kandidate.",
    );
  };

  const startRecording = async () => {
    if (!activeRecordingCandidate) {
      setMessage("Za snemanje najprej izberite kandidatni pogled ali kandidatni node, da lahko sistem sam poimenuje transkript.");
      return;
    }

    if (recordingStatus === "ready") {
      setDurationSeconds(0);
      chunksRef.current = [];
      recordingBlobRef.current = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio:
        selectedDeviceId && selectedDeviceId !== defaultDeviceValue
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
    });
    const nextRecorder = new MediaRecorder(stream, {
      audioBitsPerSecond: recordingBitsPerSecond,
    });
    chunksRef.current = [];

    nextRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    nextRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const recordingBlob = new Blob(chunksRef.current, {
        type: nextRecorder.mimeType || "audio/webm",
      });
      recordingBlobRef.current = recordingBlob;

      if (recordingBlob.size > maxAudioBytes) {
        setRecordingStatus("idle");
        setRecorder(null);
        setMessage(
          `Posnetek je prevelik (${formatBytes(recordingBlob.size)}). Limit za transkripcijo je 25 MB.`,
        );
        return;
      }

      setRecordingStatus("ready");
      setMessage("Posnetek je pripravljen. Shranite ga kot transkript, transkripcijo pa zaženite ročno.");
    };

    nextRecorder.start();
    setRecorder(nextRecorder);
    setRecordingStatus("recording");
    setMessage(null);
  };

  const pauseRecording = () => {
    if (!recorder) return;

    if (recordingStatus === "recording") {
      recorder.pause();
      setRecordingStatus("paused");
      return;
    }

    if (recordingStatus === "paused") {
      recorder.resume();
      setRecordingStatus("recording");
    }
  };

  const stopRecording = () => {
    if (!recorder || recordingStatus === "idle" || recordingStatus === "ready") return;
    recorder.stop();
  };

  const addTranscriptNode = (transcript: SavedTranscript) => {
    const existingVisibleNode = visibleNodes.find((node) => node.transcriptId === transcript.id);
    if (existingVisibleNode) {
      setSelectedNodeId(existingVisibleNode.id);
      setSelectedEdgeId(null);
      setIsTranscriptPickerOpen(false);
      setMessage("Transkript je že v tem pogledu. Lahko ga povežete s kandidatom.");
      return;
    }

    const node = buildTranscriptNode(transcript, visibleNodes.length, {
      scopeCandidateId: viewMode === "candidate" ? selectedCandidateId : undefined,
      scopeJobTitle: viewMode === "job" ? selectedJobTitle : undefined,
      ...getNodeDropPosition(),
    });
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setIsTranscriptPickerOpen(false);
  };

  const createTranscriptFromRecording = async () => {
    if (!activeRecordingCandidate) {
      setMessage("Za shranjevanje posnetka najprej izberite kandidata.");
      return;
    }

    if (recordingStatus !== "ready") {
      setMessage("Najprej zaključite posnetek.");
      return;
    }

    setIsSavingRecording(true);
    setMessage(null);

    const transcript: SavedTranscript = {
      id: crypto.randomUUID(),
      title: defaultRecordingTitle,
      durationSeconds,
      transcriptText: recordingReadyText(defaultRecordingTitle, durationSeconds),
      createdAt: new Date().toISOString(),
      status: "local",
    };
    let createdTranscript = transcript;

    const audioBlob = recordingBlobRef.current;
    if (audioBlob && audioBlob.size > maxAudioBytes) {
      setIsSavingRecording(false);
      setMessage(
        `Posnetek je prevelik (${formatBytes(audioBlob.size)}). Limit za transkripcijo je 25 MB.`,
      );
      return;
    }

    if (audioBlob && !transcriptTableMissing) {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult.user?.id;

      if (userId) {
        const storagePath = `${userId}/${transcript.id}.webm`;
        const uploadResult = await supabase.storage
          .from("interview-recordings")
          .upload(storagePath, audioBlob, {
            contentType: audioBlob.type || "audio/webm",
            upsert: true,
          });

        if (uploadResult.error) {
          setIsSavingRecording(false);
          setMessage(`Posnetka ni bilo mogoče shraniti: ${uploadResult.error.message}`);
          return;
        }

        const { data: row, error: insertError } = await supabase
          .from("interview_transcripts")
          .insert({
            id: transcript.id,
            user_id: userId,
            title: transcript.title,
            transcript_text: null,
            audio_path: storagePath,
            audio_mime_type: audioBlob.type || "audio/webm",
            duration_seconds: transcript.durationSeconds,
            status: "recorded",
            source: "recording",
            estimated_cost_usd: estimateCost(transcript.durationSeconds),
          })
          .select("id, title, transcript_text, duration_seconds, status, audio_path, error_message, created_at")
          .single();

        if (insertError) {
          setIsSavingRecording(false);
          if (isMissingTranscriptTableError(insertError)) {
            setTranscriptTableMissing(true);
            setMessage("Tabela interview_transcripts še ni v bazi. Posnetek ni vpisan kot trajni transkript.");
          } else {
            setMessage(`Transkriptnega zapisa ni bilo mogoče ustvariti: ${insertError.message}`);
          }
          return;
        }

        const persistedTranscript = transcriptFromRow(row as TranscriptRow);
        createdTranscript = persistedTranscript;
        setSavedTranscripts((current) => [persistedTranscript, ...current]);
      } else {
        setSavedTranscripts((current) => [transcript, ...current]);
      }
    } else {
      setSavedTranscripts((current) => [transcript, ...current]);
    }

    setRecordingStatus("idle");
    setDurationSeconds(0);
    setRecorder(null);
    recordingBlobRef.current = null;
    chunksRef.current = [];
    const transcriptNode = buildTranscriptNode(createdTranscript, visibleNodes.length + 1, {
      scopeCandidateId: activeRecordingCandidate.id,
      scopeJobTitle: viewMode === "job" ? selectedJobTitle : undefined,
      ...getNodeDropPosition(1),
    });
    const existingCandidateNode = nodes.find(
      (node) => node.type === "candidate" && node.candidateId === activeRecordingCandidate.id,
    );
    const candidateNode =
      existingCandidateNode ??
      buildCandidateNode(activeRecordingCandidate, visibleNodes.length, {
        scopeJobTitle: activeRecordingCandidate.role,
        ...getNodeDropPosition(),
      });
    setNodes((current) => [
      ...current,
      ...(existingCandidateNode ? [] : [candidateNode]),
      transcriptNode,
    ]);
    setEdges((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        fromNodeId: candidateNode.id,
        toNodeId: transcriptNode.id,
      },
    ]);
    setSelectedNodeId(transcriptNode.id);
    setSelectedEdgeId(null);
    setIsSavingRecording(false);
    setMessage("Posnetek je shranjen, samodejno pripet kandidatu in dodan na roadmap. Pred transkripcijo shrani roadmap.");
  };

  const addCandidateNode = (candidateId: string) => {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      setMessage("Najprej izberite kandidata iz sistema.");
      return;
    }

    const existingNode = nodes.find((node) => node.candidateId === candidate.id);
    if (existingNode) {
      setSelectedNodeId(existingNode.id);
      setSelectedEdgeId(null);
      setIsCandidatePickerOpen(false);
      setMessage("Kandidat je že na mreži.");
      return;
    }

    const node = buildCandidateNode(candidate, visibleNodes.length, {
      scopeJobTitle: candidate.role,
      ...getNodeDropPosition(),
    });
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setIsCandidatePickerOpen(false);
  };

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return null;

    return {
      x: (clientX - canvasRect.left - viewport.x) / viewport.zoom,
      y: (clientY - canvasRect.top - viewport.y) / viewport.zoom,
    };
  };

  const zoomCanvasAtPoint = (clientX: number, clientY: number, nextZoom: number) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    setViewport((current) => {
      const zoom = clamp(nextZoom, minCanvasZoom, maxCanvasZoom);
      const screenX = clientX - canvasRect.left;
      const screenY = clientY - canvasRect.top;
      const worldX = (screenX - current.x) / current.zoom;
      const worldY = (screenY - current.y) / current.zoom;

      return {
        x: screenX - worldX * zoom,
        y: screenY - worldY * zoom,
        zoom,
      };
    });
  };

  const zoomCanvasFromCenter = (delta: number) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    zoomCanvasAtPoint(
      canvasRect.left + canvasRect.width / 2,
      canvasRect.top + canvasRect.height / 2,
      viewport.zoom + delta,
    );
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    node: StudioNode,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button") || event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const worldPoint = screenToWorld(event.clientX, event.clientY);
    if (!worldPoint) return;

    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setDragState({
      nodeId: node.id,
      offsetX: worldPoint.x - node.x,
      offsetY: worldPoint.y - node.y,
    });
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panState) {
      setViewport((current) => ({
        ...current,
        x: panState.startX + event.clientX - panState.startClientX,
        y: panState.startY + event.clientY - panState.startClientY,
      }));
      return;
    }

    if (!dragState) return;

    const worldPoint = screenToWorld(event.clientX, event.clientY);
    if (!worldPoint) return;

    const nextX = snap(worldPoint.x - dragState.offsetX);
    const nextY = snap(worldPoint.y - dragState.offsetY);
    const maxX = canvasWorldWidth - nodeWidth - 20;
    const maxY = canvasWorldHeight - 160;

    setNodes((current) =>
      current.map((node) =>
        node.id === dragState.nodeId
          ? {
              ...node,
              x: Math.max(20, Math.min(maxX, nextX)),
              y: Math.max(20, Math.min(maxY, nextY)),
            }
          : node,
      ),
    );
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const onInteractive = Boolean(
      target.closest("[data-studio-node], button, a, input, textarea"),
    );
    const blank = !onInteractive;
    // Left-drag on empty canvas now pans (like Figma/Miro); middle/right/touch
    // still pan as well. A plain left click on blank space just deselects.
    const shouldPan =
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && blank) ||
      (event.pointerType === "touch" && blank);

    if (shouldPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: viewport.x,
        startY: viewport.y,
      });
      if (event.button === 0 && blank) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    }
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panState?.pointerId === event.pointerId) setPanState(null);
    setDragState(null);
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    zoomCanvasAtPoint(event.clientX, event.clientY, viewport.zoom + delta);
  };

  const finishConnection = (targetNodeId: string) => {
    if (!connectingFromNodeId || connectingFromNodeId === targetNodeId) {
      setConnectingFromNodeId(null);
      return;
    }

    const sourceNode = nodes.find((node) => node.id === connectingFromNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!sourceNode || !targetNode) {
      setConnectingFromNodeId(null);
      setMessage("Elementa za povezavo ni bilo mogoče najti.");
      return;
    }

    if (sourceNode.type === "candidate" && targetNode.type === "candidate") {
      setConnectingFromNodeId(null);
      setMessage("Kandidate povezujte prek transkriptov, ne neposredno med seboj.");
      return;
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const exists = edges.some(
      (edge) =>
        (edge.fromNodeId === sourceNode.id && edge.toNodeId === targetNode.id) ||
        (edge.fromNodeId === targetNode.id && edge.toNodeId === sourceNode.id),
    );

    if (sourceNode.type === "transcript" && targetNode.type === "transcript") {
      if (!sourceNode.transcriptId || !targetNode.transcriptId) {
        setConnectingFromNodeId(null);
        setMessage("Povezava med transkriptoma mora imeti dva transkripta iz sistema.");
        return;
      }

      if (sourceNode.transcriptId === targetNode.transcriptId) {
        setConnectingFromNodeId(null);
        setMessage("Isti transkript ne more biti povezan sam s seboj.");
        return;
      }

      const getTranscriptConnectionCount = (transcriptId: string) =>
        edges
          .map((edge) => getTranscriptTranscriptPairFromEdge(edge, nodeById))
          .filter(
            (pair) =>
              pair &&
              (pair.leftTranscriptId === transcriptId ||
                pair.rightTranscriptId === transcriptId),
          ).length;

      const sourceCount = getTranscriptConnectionCount(sourceNode.transcriptId);
      const targetCount = getTranscriptConnectionCount(targetNode.transcriptId);

      if (
        !exists &&
        (sourceCount >= maxTranscriptTranscriptConnections ||
          targetCount >= maxTranscriptTranscriptConnections)
      ) {
        setConnectingFromNodeId(null);
        setMessage(
          `En transkript ima lahko največ ${maxTranscriptTranscriptConnections} povezav z drugimi transkripti.`,
        );
        return;
      }

      if (!exists) {
        const edgeId = crypto.randomUUID();
        setEdges((current) => [
          ...current,
          {
            id: edgeId,
            fromNodeId: sourceNode.id,
            toNodeId: targetNode.id,
          },
        ]);
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        setMessage("Povezava med transkriptoma je dodana.");
      }

      setConnectingFromNodeId(null);
      return;
    }

    const fromNodeId =
      sourceNode.type === "candidate" && targetNode.type === "transcript"
        ? sourceNode.id
        : sourceNode.type === "transcript" && targetNode.type === "candidate"
          ? targetNode.id
        : sourceNode.id;
    const toNodeId =
      sourceNode.type === "candidate" && targetNode.type === "transcript"
        ? targetNode.id
        : sourceNode.type === "transcript" && targetNode.type === "candidate"
          ? sourceNode.id
          : targetNode.id;
    const candidateNode = sourceNode.type === "candidate" ? sourceNode : targetNode;
    const transcriptNode = sourceNode.type === "transcript" ? sourceNode : targetNode;

    if (!candidateNode.candidateId || !transcriptNode.transcriptId) {
      setConnectingFromNodeId(null);
      setMessage("Povezava mora imeti kandidata in transkript iz sistema.");
      return;
    }

    const existingTranscriptConnection = edges
      .map((edge) => getCandidateTranscriptPairFromEdge(edge, nodeById))
      .find((pair) => pair?.transcriptId === transcriptNode.transcriptId);

    if (existingTranscriptConnection) {
      const existingCandidate = candidates.find(
        (candidate) => candidate.id === existingTranscriptConnection.candidateId,
      );
      setConnectingFromNodeId(null);
      setMessage(
        `Ta transkript je že povezan s kandidatom ${existingCandidate?.name ?? "drug kandidat"}. En transkript je lahko vezan samo na enega kandidata.`,
      );
      return;
    }

    if (!exists) {
      const edgeId = crypto.randomUUID();
      setEdges((current) => [
        ...current,
        {
          id: edgeId,
          fromNodeId,
          toNodeId,
        },
      ]);
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      setMessage("Povezava je dodana. Kliknite Shrani mrežo, da se prikaže na profilu kandidata.");
    }

    setConnectingFromNodeId(null);
  };

  const deleteSelectedItem = async () => {
    if (selectedEdgeId) {
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      setMessage("Povezava je izbrisana.");
      return;
    }

    if (!selectedNode) {
      setMessage("Najprej izberite povezavo, kandidata ali transkript.");
      return;
    }

    const nodeId = selectedNode.id;
    const transcriptId = selectedNode.transcriptId;
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) =>
      current.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
    );
    if (transcriptId) {
      const transcript = savedTranscripts.find((item) => item.id === transcriptId);
      if (transcript?.audioPath) {
        await supabase.storage.from("interview-recordings").remove([transcript.audioPath]);
      }
      if (transcript?.status !== "local") {
        await supabase.from("interview_transcripts").delete().eq("id", transcriptId);
      }
      setSavedTranscripts((current) =>
        current.filter((transcript) => transcript.id !== transcriptId),
      );
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectingFromNodeId((current) => (current === nodeId ? null : current));
    setMessage(
      selectedNode.type === "candidate"
        ? "Kandidat je odstranjen z mreže."
        : "Transkript je izbrisan.",
    );
  };

  const transcribeSelectedTranscript = async (transcriptOverride?: SavedTranscript) => {
    if (hasUnsavedChanges) {
      setMessage("Pred transkripcijo shrani roadmap. Tako ostaneta posnetek in kandidat pravilno povezana.");
      return;
    }
    const targetTranscript = transcriptOverride ?? selectedTranscript;
    if (!targetTranscript) {
      setMessage("Najprej izberite transkript.");
      return;
    }

    if (targetTranscript.status === "local" || !targetTranscript.audioPath) {
      setMessage("Ta transkript nima shranjenega posnetka za transkripcijo.");
      return;
    }

    if (targetTranscript.status === "complete") {
      setMessage("Ta transkript je že zaključen.");
      return;
    }

    setIsTranscribing(true);
    setMessage("Transkripcija je v teku. To lahko traja nekaj trenutkov.");
    setSavedTranscripts((current) =>
      current.map((transcript) =>
        transcript.id === targetTranscript.id
          ? { ...transcript, status: "processing", errorMessage: null }
          : transcript,
      ),
    );

    const { data, error } = await supabase.functions.invoke("transcribe-interview", {
      body: {
        transcriptId: targetTranscript.id,
        confirmedMaxCostUsd: 1,
      },
    });

    setIsTranscribing(false);

    if (error) {
      setSavedTranscripts((current) =>
        current.map((transcript) =>
          transcript.id === targetTranscript.id
            ? { ...transcript, status: "failed", errorMessage: error.message }
            : transcript,
        ),
      );
      setMessage(`Transkripcija ni uspela: ${error.message}`);
      return;
    }

    const transcriptText =
      typeof data?.transcript?.transcript_text === "string"
        ? data.transcript.transcript_text
        : typeof data?.text === "string"
          ? data.text
          : "";

    const nextTranscript: SavedTranscript = {
      ...targetTranscript,
      transcriptText: transcriptText || targetTranscript.transcriptText,
      status: "complete",
      errorMessage: null,
    };

    setSavedTranscripts((current) =>
      current.map((transcript) =>
        transcript.id === targetTranscript.id ? nextTranscript : transcript,
      ),
    );
    setNodes((current) =>
      current.map((node) =>
        node.transcriptId === targetTranscript.id
          ? {
              ...node,
              transcriptText: nextTranscript.transcriptText,
              subtitle: `${formatDuration(nextTranscript.durationSeconds)} · transkript zaključen`,
            }
          : node,
      ),
    );
    setMessage("Transkripcija je zaključena.");
  };

  const analyzeActiveCandidate = async () => {
    if (!activeRecordingCandidate) {
      setMessage("Za analizo najprej izberi kandidata.");
      return;
    }
    if (hasUnsavedChanges) {
      setMessage("Pred analizo shrani roadmap.");
      return;
    }

    const candidateTranscripts = savedTranscripts.filter(
      (transcript) =>
        transcript.status === "complete" &&
        transcriptCandidateMap.get(transcript.id)?.id === activeRecordingCandidate.id,
    );
    const transcriptText = candidateTranscripts
      .map((transcript) => transcript.transcriptText.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!transcriptText) {
      setMessage("Analiza potrebuje vsaj en zaključen transkript tega kandidata.");
      return;
    }

    setIsAnalyzingCandidate(true);
    setMessage("CV + razgovor analiza je v teku.");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("Za analizo morate biti prijavljeni.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidateId: activeRecordingCandidate.id,
            jobTitle: activeRecordingCandidate.role,
            analysisMode: "cv_interview",
            transcriptText,
            transcriptIds: candidateTranscripts.map((transcript) => transcript.id),
          }),
        },
      );

      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      const analysis = payload?.interviewAnalysis;
      if (!analysis) throw new Error("Analiza ni vrnila rezultata.");

      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === activeRecordingCandidate.id
            ? {
                ...candidate,
                interviewAnalysisStatus: "complete",
                followUpQuestions: Array.isArray(analysis.interview_analysis_questions)
                  ? analysis.interview_analysis_questions
                  : candidate.followUpQuestions,
              }
            : candidate,
        ),
      );
      setMessage("CV + razgovor analiza je zaključena. Roadmap je posodobljen.");
    } catch (error) {
      setMessage(
        `Analiza ni uspela: ${error instanceof Error ? error.message : "neznana napaka"}`,
      );
    } finally {
      setIsAnalyzingCandidate(false);
    }
  };

  const updateDetailCandidateStage = async () => {
    if (!detailCandidate) {
      setMessage("Kandidat ni izbran.");
      return;
    }
    if (hasUnsavedChanges) {
      setMessage("Pred spremembo faze shrani roadmap.");
      return;
    }

    // Same strict-guided rules as the candidate page: no skipping ahead, and
    // backward / reject / reopen moves are confirmed.
    if (candidateStageDraft !== detailCandidate.stage) {
      const check = checkTransition(detailCandidate.stage, candidateStageDraft);
      if (!check.allowed) {
        setMessage(
          check.kind === "blocked"
            ? "Faze ni mogoče preskočiti — premikaj po korakih."
            : "Te spremembe faze trenutno ni mogoče izvesti.",
        );
        return;
      }
      if (check.requiresConfirm) {
        const ok = await confirm({ description: "Spremeniti fazo kandidata?" });
        if (!ok) return;
      }
    }

    setIsSavingCandidateStage(true);
    const { error } = await supabase
      .from("candidates")
      .update({ stage: candidateStageDraft })
      .eq("id", detailCandidate.id);

    setIsSavingCandidateStage(false);

    if (error) {
      setMessage(`Faze kandidata ni bilo mogoče posodobiti: ${error.message}`);
      return;
    }

    const updatedCandidate = { ...detailCandidate, stage: candidateStageDraft };
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === detailCandidate.id ? updatedCandidate : candidate,
      ),
    );
    setNodes((current) =>
      current.map((node) =>
        node.candidateId === detailCandidate.id
          ? {
              ...node,
              subtitle: formatCandidateSubtitle(updatedCandidate),
            }
          : node,
      ),
    );
    setMessage(`Faza kandidata je posodobljena na ${stageLabels[candidateStageDraft]}.`);
  };

  const arrangeCurrentView = () => {
    const visibleCandidateNodes = visibleNodes
      .filter((node) => node.type === "candidate")
      .sort((first, second) => first.title.localeCompare(second.title, "sl"));
    const visibleTranscriptNodes = visibleNodes.filter((node) => node.type === "transcript");
    const nextPositions = new Map<string, { x: number; y: number }>();

    visibleCandidateNodes.forEach((node, index) => {
      const y = snap(120 + index * 170);
      nextPositions.set(node.id, { x: snap(180), y });

      const connectedTranscriptIds = visibleEdges
        .filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id)
        .map((edge) => (edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId))
        .filter((nodeId) => visibleTranscriptNodes.some((transcriptNode) => transcriptNode.id === nodeId));

      connectedTranscriptIds.forEach((transcriptNodeId, transcriptIndex) => {
        if (nextPositions.has(transcriptNodeId)) return;
        nextPositions.set(transcriptNodeId, {
          x: snap(560 + transcriptIndex * 300),
          y: snap(y + transcriptIndex * 45),
        });
      });
    });

    visibleTranscriptNodes
      .filter((node) => !nextPositions.has(node.id))
      .forEach((node, index) => {
        nextPositions.set(node.id, {
          x: snap(560 + (index % 2) * 300),
          y: snap(120 + Math.floor(index / 2) * 150),
        });
      });

    const arrangedVisibleNodes = visibleNodes.map((node) => ({
      ...node,
      ...(nextPositions.get(node.id) ?? {}),
    }));
    setNodes((current) =>
      current.map((node) => {
        const position = nextPositions.get(node.id);
        return position ? { ...node, ...position } : node;
      }),
    );
    setViewport(getFitViewport(arrangedVisibleNodes));
    setMessage("Pogled je urejen brez prekrivanja.");
  };

  const cost = estimateCost(durationSeconds);
  const isNearLimit = durationSeconds >= warningSeconds;
  const estimatedRecordingBytes = estimateRecordingBytes(durationSeconds);
  const recordedBlobSize = recordingBlobRef.current?.size ?? null;
  const shownRecordingBytes = recordedBlobSize ?? estimatedRecordingBytes;
  const isNearAudioLimit = shownRecordingBytes >= maxAudioBytes * 0.8;
  const roadmapCandidate =
    interviewCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  const roadmapTranscripts = savedTranscripts
    .filter(
      (transcript) =>
        transcriptCandidateMap.get(transcript.id)?.id === roadmapCandidate?.id,
    )
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
  const roadmapSelectedTranscript =
    roadmapTranscripts.find((transcript) => transcript.id === selectedTranscript?.id) ??
    roadmapTranscripts[0] ??
    null;
  const lastSavedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString("sl-SI", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "še ni shranjeno";
  const deleteDisabled = !selectedEdgeId && !selectedNode;
  const deleteLabel = selectedEdgeId
    ? "Izbriši povezavo"
    : selectedNode?.type === "candidate"
      ? "Izbriši kandidata"
      : selectedNode?.type === "transcript"
        ? "Izbriši transkript"
        : "Izbriši izbrano";

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] w-full max-w-full flex-col overflow-hidden bg-card text-card-foreground lg:h-[calc(100vh-7.5rem)] lg:min-h-[620px]">
      {/* Roadmap is primary; reader and network canvas support deeper work. */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Mic className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Studio razgovorov</span>
            <span className="block truncate text-xs text-muted-foreground">Priprava, izvedba, zapiski in odločitev na enem mestu</span>
          </span>
        </div>
        <div className="inline-flex rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setStudioView("roadmap")}
            aria-pressed={studioView === "roadmap"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              studioView === "roadmap"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Roadmap
          </button>
          <button
            type="button"
            onClick={() => setStudioView("reader")}
            aria-pressed={studioView === "reader"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              studioView === "reader"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Bralnik
          </button>
          <button
            type="button"
            onClick={() => setStudioView("map")}
            aria-pressed={studioView === "map"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              studioView === "map"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mreža
          </button>
        </div>
      </div>

      {studioView === "roadmap" ? (
        <CandidateInterviewRoadmap
          candidate={roadmapCandidate}
          candidates={interviewCandidates}
          transcripts={roadmapTranscripts}
          selectedCandidateId={selectedCandidateId}
          selectedTranscriptId={roadmapSelectedTranscript?.id}
          recordingStatus={recordingStatus}
          isSaving={isSavingBoard}
          isTranscribing={isTranscribing}
          isAnalyzing={isAnalyzingCandidate}
          hasUnsavedChanges={hasUnsavedChanges}
          onCandidateChange={(candidateId) => {
            setViewMode("candidate");
            setSelectedCandidateId(candidateId);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          onRecord={() => void startRecording()}
          onStop={stopRecording}
          onSaveRecording={() => void createTranscriptFromRecording()}
          onSaveRoadmap={() => void saveBoard()}
          onSelectTranscript={(transcriptId) => {
            const transcriptNode = nodes.find(
              (node) => node.transcriptId === transcriptId,
            );
            setSelectedNodeId(transcriptNode?.id ?? null);
            setSelectedEdgeId(null);
          }}
          onTranscribe={() =>
            roadmapSelectedTranscript &&
            void transcribeSelectedTranscript(roadmapSelectedTranscript)
          }
          onAnalyze={() => void analyzeActiveCandidate()}
        />
      ) : studioView === "reader" ? (
        <TranscriptReader
          transcripts={savedTranscripts}
          candidateByTranscriptId={transcriptCandidateMap}
          onOpenCandidate={(candidateId) =>
            navigate(`/applicants/${candidateId}?returnTo=/interviews`)
          }
          onOpenMap={() => setStudioView("map")}
        />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside className="flex max-h-[34dvh] w-full shrink-0 flex-col overflow-x-hidden border-b border-border bg-card sm:max-h-[40dvh] lg:max-h-none lg:w-[min(21rem,36vw)] lg:min-w-[18rem] lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Studio razgovorov</h1>
              <p className="mt-1 text-sm text-muted-foreground">Mreža kandidatov in transkriptov.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Prikaži vodič"
              onClick={() => setIsGuideOpen(true)}
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Kako uporabljati Razgovore</DialogTitle>
              <DialogDescription>
                Vsa dodatna navodila za snemanje, poimenovanje, poglede in povezovanje so zbrana tukaj.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "1. Izberi pogled",
                  body: "Pogled Kandidat pokaže enega kandidata in njegove transkripte. Pogled Delovno mesto združi vse kandidate iste pozicije na isto mrežo. Celotna mreža je namenjena pregledu vseh povezav.",
                  image: "/images/mreza.svg",
                },
                {
                  title: "2. Posnemi razgovor",
                  body: "Pred snemanjem mora biti izbran kandidat ali kandidatni node. Ime transkripta se ustvari samodejno: ime kandidata + razgovor + zaporedna številka.",
                  image: "/images/zagovor.svg",
                },
                {
                  title: "3. Dodaj obstoječi transkript",
                  body: "Shranjeni transkripti so na voljo prek gumba Dodaj transkript nad mrežo, kjer jih lahko tudi iščete. Levi meni zato ne podvaja seznama transkriptov.",
                  image: "/images/zagovor-transkript.svg",
                },
                {
                  title: "4. Poveži in shrani",
                  body: "Kliknite Poveži na kandidatu, nato Poveži na transkriptu. En transkript je lahko vezan samo na enega kandidata; med transkripti pa ima lahko največ pet povezav.",
                  image: "/images/shrani.svg",
                },
              ].map((step) => (
                <div key={step.title} className="rounded-md border border-border bg-muted/30 p-4">
                  <img
                    src={step.image}
                    alt={step.title}
                    className="mb-3 aspect-video w-full rounded-md border border-border bg-background object-cover"
                  />
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4 text-sm leading-relaxed text-cyan-950">
              Posnetek je omejen na 60 minut in 25 MB. Transkripcija se ne zažene samodejno; izberite transkriptni node in kliknite Zaženi transkripcijo. Če se elementi prekrivajo, uporabite Uredi pogled brez prekrivanja.
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setIsGuideOpen(false)}>
                Razumem
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Dokončaj mrežo razgovora</DialogTitle>
              <DialogDescription>
                Kandidat je že prikazan v pravem pogledu. Ustvarite ali izberite transkript, kliknite
                Poveži na kandidatu in transkriptu, nato shranite mrežo.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
              {viewMode === "candidate"
                ? "Pogled je omejen na enega kandidata in njegove transkripte."
                : "Pogled delovnega mesta združi vse kandidate iste pozicije na eno mrežo."}
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setIsCompletionDialogOpen(false)}>
                Nadaljuj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4">
          <section className="grid gap-3 rounded-md border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {viewMode === "candidate" ? (
                <Users className="h-4 w-4" />
              ) : (
                <Briefcase className="h-4 w-4" />
              )}
              Pogled mreže
            </div>
            <div className="grid gap-2">
              <Label>Način</Label>
              <Select
                value={viewMode}
                onValueChange={(value) => {
                  const nextMode = value as BoardViewMode;
                  setViewMode(nextMode);
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">Kandidat</SelectItem>
                  <SelectItem value="job">Delovno mesto</SelectItem>
                  <SelectItem value="all">Celotna mreža</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {viewMode === "candidate" ? (
              <div className="grid gap-2">
                <Label>Kandidat</Label>
                <Select
                  value={selectedCandidateId || allViewValue}
                  onValueChange={(value) => {
                    setSelectedCandidateId(value === allViewValue ? "" : value);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }}
                >
                  <SelectTrigger className="min-w-0 max-w-full [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allViewValue}>Izberi kandidata</SelectItem>
                    {candidatePickerOptions.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {viewMode === "job" ? (
              <div className="grid gap-2">
                <Label>Delovno mesto</Label>
                <Select
                  value={selectedJobTitle || allViewValue}
                  onValueChange={(value) => {
                    setSelectedJobTitle(value === allViewValue ? "" : value);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }}
                >
                  <SelectTrigger className="min-w-0 max-w-full [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allViewValue}>Izberi delovno mesto</SelectItem>
                    {jobTitles.map((jobTitle) => (
                      <SelectItem key={jobTitle} value={jobTitle}>
                        {jobTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button type="button" variant="outline" onClick={arrangeCurrentView}>
              Uredi pogled brez prekrivanja
            </Button>
          </section>

          <section className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mic className="h-4 w-4" />
              Snemanje
            </div>
            <div className="rounded-md border border-border bg-muted/25 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Naslednji transkript
              </div>
              <div className="mt-1 font-medium text-foreground">
                {activeRecordingCandidate ? defaultRecordingTitle : "Izberi kandidata za samodejno ime"}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Mikrofon</Label>
              <Select
                value={selectedDeviceId || defaultDeviceValue}
                onValueChange={setSelectedDeviceId}
              >
                <SelectTrigger className="min-w-0 max-w-full [&>span]:truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={defaultDeviceValue}>Privzeti mikrofon</SelectItem>
                  {devices.filter((device) => device.deviceId).map((device, index) => (
                    <SelectItem
                      key={device.deviceId}
                      value={device.deviceId}
                    >
                      {device.label || `Mikrofon ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border bg-muted/35 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {formatDuration(durationSeconds)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ocena stroška ${cost.toFixed(3)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Velikost posnetka</span>
                <span className={isNearAudioLimit ? "text-amber-600" : ""}>
                  {formatBytes(shownRecordingBytes)} / 25 MB
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${isNearLimit ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (durationSeconds / maxRecordingSeconds) * 100)}%` }}
                />
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${isNearAudioLimit ? "bg-amber-500" : "bg-cyan-500"}`}
                  style={{ width: `${Math.min(100, (shownRecordingBytes / maxAudioBytes) * 100)}%` }}
                />
              </div>
            </div>

            {isNearLimit ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Posnetek je dolg. Pred transkripcijo preverite strošek in vsebino.
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                onClick={startRecording}
                disabled={recordingStatus === "recording"}
                className="min-w-0 gap-2 px-2"
              >
                <Play className="h-4 w-4" />
                <span className="truncate">Rec</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={pauseRecording}
                disabled={recordingStatus !== "recording" && recordingStatus !== "paused"}
                className="min-w-0 gap-2 px-2"
              >
                <Pause className="h-4 w-4" />
                <span className="truncate">Pause</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={stopRecording}
                disabled={recordingStatus !== "recording" && recordingStatus !== "paused"}
                className="min-w-0 gap-2 px-2"
              >
                <Square className="h-4 w-4" />
                <span className="truncate">Stop</span>
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={createTranscriptFromRecording}
              disabled={isSavingRecording || recordingStatus !== "ready" || !activeRecordingCandidate}
              className="gap-2"
            >
              {isSavingRecording ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Shrani posnetek kot transkript
            </Button>
          </section>
        </div>
      </aside>

      <main className="relative h-[72dvh] min-h-[34rem] min-w-0 flex-1 overflow-hidden bg-background lg:h-auto lg:min-h-0">
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-wrap items-start gap-2 lg:left-4 lg:right-72 lg:top-4 lg:gap-3">
          <div className="pointer-events-auto max-w-full rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm lg:max-w-[34rem]">
            {visibleNodes.length} elementov · {visibleEdges.length} povezav
            {connectingFromNodeId
              ? " · izberite drugi element za povezavo"
              : selectedEdge
                ? " · povezava izbrana"
                : " · povlecite za premik, kolešček za povečavo"}
          </div>
          <Popover open={isCandidatePickerOpen} onOpenChange={setIsCandidatePickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" className="pointer-events-auto min-w-0 flex-1 justify-start gap-2 shadow-lg sm:flex-none sm:min-w-48">
                <UserPlus className="h-4 w-4" />
                Dodaj kandidata
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-80" align="center">
              <Command>
                <CommandInput placeholder="Išči kandidata..." />
                <CommandList>
                  <CommandEmpty>Ni kandidatov za ta iskalni niz.</CommandEmpty>
                  <CommandGroup heading="Kandidati iz baze">
                    {candidatePickerOptions.map((candidate) => (
                      <CommandItem
                        key={candidate.id}
                        value={`${candidate.name} ${candidate.role} ${stageLabels[candidate.stage]}`}
                        onSelect={() => addCandidateNode(candidate.id)}
                      >
                        <Users className="h-4 w-4 text-cyan-500" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block truncate font-medium">{candidate.name}</span>
                            {candidate.isNew ? (
                              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                                New
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {candidate.role} · {stageLabels[candidate.stage]}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={isTranscriptPickerOpen} onOpenChange={setIsTranscriptPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="pointer-events-auto min-w-0 flex-1 justify-start gap-2 bg-card/95 shadow-lg sm:flex-none sm:min-w-48">
                <FileText className="h-4 w-4" />
                Dodaj transkript
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-96" align="center">
              <Command>
                <CommandInput placeholder="Išči transkript..." />
                <CommandList>
                  <CommandEmpty>Ni transkriptov za ta iskalni niz.</CommandEmpty>
                  <CommandGroup heading="Transkripti iz baze">
                    {savedTranscripts.map((transcript) => (
                      <CommandItem
                        key={transcript.id}
                        value={`${transcript.title} ${transcript.status} ${transcript.transcriptText}`}
                        onSelect={() => addTranscriptNode(transcript)}
                      >
                        <FileText className="h-4 w-4 text-violet-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{transcript.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatDuration(transcript.durationSeconds)} · {transcript.status}
                            {transcript.audioPath ? " · posnetek" : " · brez posnetka"}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-30 rounded-md border border-border bg-card/95 p-2 shadow-lg backdrop-blur lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:w-60 lg:p-3">
          <div className="mb-3 hidden items-center gap-2 text-sm font-semibold text-foreground lg:flex">
            <Database className="h-4 w-4" />
            Mreža
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="col-span-3 grid grid-cols-3 gap-2 lg:col-span-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => zoomCanvasFromCenter(-0.15)}
                disabled={viewport.zoom <= minCanvasZoom}
              >
                -
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setViewport(visibleNodes.length ? getFitViewport(visibleNodes) : getCenteredViewport())
                }
              >
                {Math.round(viewport.zoom * 100)}%
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => zoomCanvasFromCenter(0.15)}
                disabled={viewport.zoom >= maxCanvasZoom}
              >
                +
              </Button>
            </div>
            <Button
              type="button"
              onClick={saveBoard}
              disabled={isSavingBoard || !hasUnsavedChanges}
              className="justify-center gap-2 px-2 lg:justify-start"
            >
              {isSavingBoard ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="lg:hidden">Shrani</span>
              <span className="hidden lg:inline">Shrani mrežo</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void transcribeSelectedTranscript()}
              disabled={
                isTranscribing ||
                selectedTranscript == null ||
                selectedTranscript.status === "local" ||
                selectedTranscript.status === "processing" ||
                 selectedTranscript.status === "complete" ||
                 hasUnsavedChanges ||
                !selectedTranscript.audioPath
              }
              className="justify-center gap-2 px-2 lg:justify-start"
            >
              {isTranscribing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              <span className="lg:hidden">Vprašanja</span>
              <span className="hidden lg:inline">Zaženi transkripcijo</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={deleteSelectedItem}
              disabled={deleteDisabled}
              className="justify-center gap-2 px-2 lg:justify-start"
            >
              <Trash2 className="h-4 w-4" />
              <span className="lg:hidden">Briši</span>
              <span className="hidden lg:inline">{deleteLabel}</span>
            </Button>
          </div>
          <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
            Zadnje shranjevanje: {lastSavedLabel}
          </p>
          {pinnedQuestionCandidate ? (
            <section className="mt-3 max-h-[42vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Bot className="h-4 w-4 text-cyan-500" />
                    Vprašanja
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {pinnedQuestionCandidate.name}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Skrij vprašanja"
                  className="rounded-md border border-border p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
                  onClick={() => setPinnedQuestionCandidateId(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Predlagana vprašanja
                  </h3>
                  {pinnedQuestionCandidate.interviewQuestions.length ? (
                    <ol className="mt-2 space-y-2 text-foreground">
                      {pinnedQuestionCandidate.interviewQuestions.map((question, index) => (
                        <li key={`${question}-${index}`} className="leading-relaxed">
                          {index + 1}. {question}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Predlagana vprašanja še niso pripravljena.
                    </p>
                  )}
                </div>

                <div className="border-t border-border pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nadaljnja vprašanja
                  </h3>
                  {pinnedQuestionCandidate.followUpQuestions.length ? (
                    <ol className="mt-2 space-y-2 text-foreground">
                      {pinnedQuestionCandidate.followUpQuestions.map((question, index) => (
                        <li key={`${question}-${index}`} className="leading-relaxed">
                          {index + 1}. {question}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nadaljnja vprašanja se prikažejo po CV + razgovor re-analizi.
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setPinnedQuestionCandidateId(null)}
                >
                  Skrij
                </Button>
              </div>
            </section>
          ) : null}
          {boardTableMissing ? (
            <p className="mt-2 hidden rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 lg:block">
              Za trajno shrambo najprej zaženite SQL za <code>interview_studio_boards</code>.
            </p>
          ) : null}
          {transcriptTableMissing ? (
            <p className="mt-2 hidden rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 lg:block">
              Za posnetke in transkripte zaženite SQL za <code>interview_transcripts</code>.
            </p>
          ) : null}
          {selectedTranscript ? (
            <p className="mt-2 hidden text-xs text-muted-foreground lg:block">
              Izbran transkript: {selectedTranscript.status}
            </p>
          ) : null}
        </div>

        {message ? (
          <div className="absolute bottom-28 left-3 right-3 z-20 rounded-md border border-border bg-card/95 px-3 py-2 text-sm text-muted-foreground shadow-sm lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-md">
            {message}
          </div>
        ) : null}

        <div
          ref={canvasRef}
          className={`absolute inset-0 touch-none overflow-hidden ${
            panState ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onContextMenu={(event) => event.preventDefault()}
          onWheel={handleCanvasWheel}
        >
          {isLoadingBoard ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-md border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                Nalaganje mreže razgovorov...
              </div>
            </div>
          ) : visibleNodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="max-w-sm rounded-md border border-border bg-card/95 px-5 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-foreground">Mreža je prazna</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Na levi dodajte kandidata ali transkript, nato ju ročno povežite.
                </p>
              </div>
            </div>
          ) : null}

          <div
            className="absolute left-0 top-0"
            onPointerDown={(event) => {
              if (event.button === 0 && event.target === event.currentTarget) {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }
            }}
            style={{
              width: canvasWorldWidth,
              height: canvasWorldHeight,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              transformOrigin: "0 0",
              backgroundImage:
                "linear-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
              backgroundSize: `${gridSize}px ${gridSize}px`,
              backgroundPosition: "0 0",
              willChange: "transform",
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={canvasWorldWidth}
              height={canvasWorldHeight}
            >
              <defs>
                <marker
                  id="studio-arrow-candidate"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="#2563eb" />
                </marker>
                <marker
                  id="studio-arrow-transcript"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="#ec4899" />
                </marker>
                <marker
                  id="studio-arrow-selected"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="#f59e0b" />
                </marker>
              </defs>
              {visibleEdges.map((edge) => {
                const fromNode = visibleNodes.find((node) => node.id === edge.fromNodeId);
                const toNode = visibleNodes.find((node) => node.id === edge.toNodeId);
                const from = nodeCenters.get(edge.fromNodeId);
                const to = nodeCenters.get(edge.toNodeId);
                if (!from || !to) return null;
                const midX = (from.x + to.x) / 2;
                const selected = edge.id === selectedEdgeId;
                const edgeColor = getEdgeColor(fromNode, toNode, selected);
                return (
                  <g key={edge.id}>
                    <path
                      d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="18"
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                        setConnectingFromNodeId(null);
                      }}
                    />
                    <path
                      d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth={selected ? "3" : "2"}
                      markerEnd={getEdgeMarkerId(fromNode, toNode, selected)}
                      opacity={selected ? "1" : "0.82"}
                    />
                  </g>
                );
              })}
            </svg>

            {visibleNodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                hasConnectionStart={Boolean(connectingFromNodeId)}
                selected={selectedNodeId === node.id}
                isConnecting={connectingFromNodeId === node.id}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onConnectStart={() => setConnectingFromNodeId(node.id)}
                onConnectEnd={() => finishConnection(node.id)}
                onOpenDetails={() => {
                  setDetailNodeId(node.id);
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                  setConnectingFromNodeId(null);
                }}
              />
            ))}
          </div>
        </div>
      </main>
      </div>
      )}
      <Dialog open={Boolean(detailNode)} onOpenChange={(open) => !open && setDetailNodeId(null)}>
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-3xl">
          {detailNode?.type === "transcript" ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailTranscript?.title ?? detailNode.title}</DialogTitle>
                <DialogDescription>
                  {detailTranscript
                    ? `${formatDuration(detailTranscript.durationSeconds)} · ${detailTranscript.status}`
                    : "Podrobnosti transkripta niso na voljo."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 overflow-hidden">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-border bg-muted/25 p-3">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1 font-medium text-foreground">
                      {detailTranscript?.status ?? "neznano"}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/25 p-3">
                    <div className="text-xs text-muted-foreground">Posnetek</div>
                    <div className="mt-1 truncate font-medium text-foreground">
                      {detailTranscript?.audioPath ? "Shranjeno" : "Brez posnetka"}
                    </div>
                  </div>
                </div>

                {detailTranscript?.errorMessage ? (
                  <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                    {detailTranscript.errorMessage}
                  </div>
                ) : null}

                <div className="min-h-0 rounded-md border border-border bg-muted/20 p-4">
                  <div className="mb-2 text-sm font-semibold text-foreground">Besedilo transkripta</div>
                  <div className="max-h-[48vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {detailTranscript?.transcriptText?.trim() || "Transkript še ni pripravljen."}
                  </div>
                </div>
              </div>
            </>
          ) : detailNode?.type === "candidate" ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailCandidate?.name ?? detailNode.title}</DialogTitle>
                <DialogDescription>
                  {detailCandidate?.role ?? detailNode.subtitle}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="rounded-md border border-border bg-muted/25 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Trenutna faza</div>
                  <div className="mt-1 font-medium text-foreground">
                    {detailCandidate ? stageLabels[detailCandidate.stage] : "neznano"}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Spremeni fazo</Label>
                  <Select
                    value={candidateStageDraft}
                    onValueChange={(value) => setCandidateStageDraft(value as CandidateStage)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {candidateStages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stageLabels[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Bot className="h-4 w-4 text-cyan-500" />
                        Vprašanja za razgovor
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Predlagana vprašanja iz pregleda kandidata in nadaljnja vprašanja po ponovnem pregledu.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!detailCandidate || detailCandidateQuestionCount === 0}
                      onClick={() => detailCandidate && pinCandidateQuestions(detailCandidate)}
                    >
                      Pripni na mrežo
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-background p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Predlagana vprašanja
                      </h4>
                      {detailCandidate?.interviewQuestions.length ? (
                        <ol className="mt-2 space-y-2 text-sm leading-relaxed text-foreground">
                          {detailCandidate.interviewQuestions.map((question, index) => (
                            <li key={`${question}-${index}`}>
                              {index + 1}. {question}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Predlagana vprašanja še niso pripravljena.
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Nadaljnja vprašanja
                      </h4>
                      {detailCandidate?.followUpQuestions.length ? (
                        <ol className="mt-2 space-y-2 text-sm leading-relaxed text-foreground">
                          {detailCandidate.followUpQuestions.map((question, index) => (
                            <li key={`${question}-${index}`}>
                              {index + 1}. {question}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Prikažejo se po CV + razgovor re-analizi.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  onClick={updateDetailCandidateStage}
                  disabled={!detailCandidate || isSavingCandidateStage}
                  className="gap-2"
                >
                  {isSavingCandidateStage ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Shrani fazo
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
