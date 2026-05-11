import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  AlertTriangle,
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
  Search,
  Square,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
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
import { Input } from "../components/ui/input";
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
import { Textarea } from "../components/ui/textarea";
import { supabase } from "../lib/supabase";
import { syncCandidateTranscriptLinks } from "../lib/interviewTranscriptLinks";

type StudioCandidate = {
  id: string;
  name: string;
  role: string;
  stage: CandidateStage;
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

const snapSize = 5;
const gridSize = 15;
const nodeWidth = 260;
const nodeCenterX = nodeWidth / 2;
const nodeCenterY = 58;
const canvasWorldWidth = 6400;
const canvasWorldHeight = 4200;
const minCanvasZoom = 0.35;
const maxCanvasZoom = 1.8;
const defaultViewport = { x: -220, y: -110, zoom: 1 };
const maxRecordingSeconds = 60 * 60;
const warningSeconds = 30 * 60;
const maxAudioBytes = 25 * 1024 * 1024;
const recordingBitsPerSecond = 32_000;
const miniTranscribePricePerMinute = 0.003;
const defaultDeviceValue = "__default_microphone__";
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

const snap = (value: number) => Math.round(value / snapSize) * snapSize;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

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

export default function InterviewStudio() {
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
  const [candidateStageDraft, setCandidateStageDraft] = useState<CandidateStage>("Screening");
  const [isSavingCandidateStage, setIsSavingCandidateStage] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<"idle" | "recording" | "paused" | "ready">("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [transcriptName, setTranscriptName] = useState("");
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const [manualTranscriptName, setManualTranscriptName] = useState("");
  const [manualTranscriptText, setManualTranscriptText] = useState("");
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [isCandidatePickerOpen, setIsCandidatePickerOpen] = useState(false);
  const [isTranscriptPickerOpen, setIsTranscriptPickerOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingBlobRef = useRef<Blob | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      const [{ data: candidateRows }, { data: userResult }] = await Promise.all([
        supabase
        .from("candidates")
        .select("id, full_name, job_title, stage")
        .order("created_at", { ascending: false })
          .limit(80),
        supabase.auth.getUser(),
      ]);

      if (!isMounted) return;

      setCandidates(
        ((candidateRows ?? []) as Array<{ id: string; full_name: string; job_title: string; stage: string | null }>).map(
          (candidate) => ({
            id: candidate.id,
            name: candidate.full_name,
            role: candidate.job_title,
            stage: candidateStages.includes(candidate.stage as CandidateStage)
              ? (candidate.stage as CandidateStage)
              : "Applied",
          }),
        ),
      );

      const userId = userResult.user?.id;
      if (!userId) {
        setIsLoadingBoard(false);
        setMessage("Za shranjevanje mreže morate biti prijavljeni.");
        return;
      }

      const { data: board, error } = await supabase
        .from("interview_studio_boards")
        .select("id, nodes, edges, transcripts, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

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
        setBoardId(board.id);
        setNodes(normalizeNodes(board.nodes));
        setEdges(normalizeEdges(board.edges));
        setSavedTranscripts(normalizeTranscripts(board.transcripts));
        setLastSavedAt(board.updated_at ?? null);
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

  const nodeCenters = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          {
            x: node.x + nodeCenterX,
            y: node.y + nodeCenterY,
          },
        ]),
      ),
    [nodes],
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

  useEffect(() => {
    if (detailCandidate) {
      setCandidateStageDraft(detailCandidate.stage);
    }
  }, [detailCandidate]);

  const filteredTranscripts = useMemo(() => {
    const query = transcriptSearchQuery.trim().toLowerCase();
    if (!query) return savedTranscripts;

    return savedTranscripts.filter((transcript) => {
      const searchableText = [
        transcript.title,
        transcript.status,
        transcript.transcriptText,
        transcript.errorMessage ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [savedTranscripts, transcriptSearchQuery]);

  const refreshTranscripts = async () => {
    const { data: userResult } = await supabase.auth.getUser();
    const userId = userResult.user?.id;
    if (!userId) {
      setMessage("Za nalaganje transkriptov morate biti prijavljeni.");
      return;
    }

    const { data, error } = await supabase
      .from("interview_transcripts")
      .select("id, title, transcript_text, duration_seconds, status, audio_path, error_message, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (isMissingTranscriptTableError(error)) {
        setTranscriptTableMissing(true);
        setMessage("Tabela interview_transcripts še ni v bazi.");
        return;
      }

      setMessage(`Transkriptov ni bilo mogoče osvežiti: ${error.message}`);
      return;
    }

    const persistedTranscripts = ((data ?? []) as TranscriptRow[]).map(transcriptFromRow);
    setTranscriptTableMissing(false);
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
    setMessage(`Naloženih transkriptov: ${persistedTranscripts.length}.`);
  };

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

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const candidateTranscriptPairs = edges
      .map((edge) => {
        const left = nodeById.get(edge.fromNodeId);
        const right = nodeById.get(edge.toNodeId);
        const candidateNode =
          left?.type === "candidate" ? left : right?.type === "candidate" ? right : null;
        const transcriptNode =
          left?.type === "transcript" ? left : right?.type === "transcript" ? right : null;

        return {
          candidateId: candidateNode?.candidateId ?? "",
          transcriptId: transcriptNode?.transcriptId ?? "",
        };
      })
      .filter((pair) => pair.candidateId && pair.transcriptId);

    const { data, error } = await supabase
      .from("interview_studio_boards")
      .upsert(
        {
          id: boardId ?? undefined,
          user_id: userId,
          title: "Studio razgovorov",
          nodes,
          edges,
          transcripts: savedTranscripts,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id, updated_at")
      .single();

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

    setMessage("Mreža razgovorov je shranjena, transkripti pa so vezani na kandidate.");
  };

  const startRecording = async () => {
    if (!transcriptName.trim()) {
      setMessage("Pred snemanjem obvezno vpišite ime transkripta.");
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
    const nodeId = `transcript-${transcript.id}-${crypto.randomUUID()}`;
    const statusLabel =
      transcript.status === "complete"
        ? "transkript zaključen"
        : transcript.status === "recorded"
          ? "posnetek pripravljen"
          : transcript.status === "processing"
            ? "transkripcija v teku"
            : transcript.status === "failed"
              ? "transkripcija ni uspela"
              : "lokalni transkript";
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: "transcript",
        title: transcript.title,
        subtitle: `${formatDuration(transcript.durationSeconds)} · ${statusLabel}`,
        x: snap(520 + current.length * 20),
        y: snap(220 + current.length * 20),
        transcriptId: transcript.id,
        transcriptText: transcript.transcriptText,
      },
    ]);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setIsCandidatePickerOpen(false);
  };

  const createTranscriptFromRecording = async () => {
    if (!transcriptName.trim()) {
      setMessage("Ime transkripta je obvezno.");
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
      title: transcriptName.trim(),
      durationSeconds,
      transcriptText: recordingReadyText(transcriptName.trim(), durationSeconds),
      createdAt: new Date().toISOString(),
      status: "local",
    };

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
        setSavedTranscripts((current) => [persistedTranscript, ...current]);
      } else {
        setSavedTranscripts((current) => [transcript, ...current]);
      }
    } else {
      setSavedTranscripts((current) => [transcript, ...current]);
    }

    setRecordingStatus("idle");
    setDurationSeconds(0);
    setTranscriptName("");
    setRecorder(null);
    recordingBlobRef.current = null;
    chunksRef.current = [];
    setIsSavingRecording(false);
    setMessage("Posnetek je shranjen kot transkript. Na mrežo ga dodajte z zgornjim gumbom.");
  };

  const addManualTranscript = async () => {
    if (!manualTranscriptName.trim()) {
      setMessage("Ime transkripta je obvezno, drugače hitro nastane zmeda.");
      return;
    }

    const transcript: SavedTranscript = {
      id: crypto.randomUUID(),
      title: manualTranscriptName.trim(),
      durationSeconds: 0,
      transcriptText:
        manualTranscriptText.trim() ||
        "Ročno dodan transkript. Vnesite vsebino ali ga kasneje zamenjajte s pravo transkripcijo.",
      createdAt: new Date().toISOString(),
      status: "complete",
    };

    if (!transcriptTableMissing) {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult.user?.id;
      if (userId) {
        const { data: row, error } = await supabase
          .from("interview_transcripts")
          .insert({
            id: transcript.id,
            user_id: userId,
            title: transcript.title,
            transcript_text: transcript.transcriptText,
            duration_seconds: 0,
            status: "complete",
            source: "manual",
          })
          .select("id, title, transcript_text, duration_seconds, status, audio_path, error_message, created_at")
          .single();

        if (error) {
          if (isMissingTranscriptTableError(error)) {
            setTranscriptTableMissing(true);
          } else {
            setMessage(`Transkripta ni bilo mogoče shraniti: ${error.message}`);
            return;
          }
        } else {
          const persistedTranscript = transcriptFromRow(row as TranscriptRow);
          setSavedTranscripts((current) => [persistedTranscript, ...current]);
          setManualTranscriptName("");
          setManualTranscriptText("");
          setMessage("Transkript je shranjen. Na mrežo ga dodajte z zgornjim gumbom.");
          return;
        }
      }
    }

    setSavedTranscripts((current) => [transcript, ...current]);
    setManualTranscriptName("");
    setManualTranscriptText("");
    setMessage("Transkript je shranjen. Na mrežo ga dodajte z zgornjim gumbom.");
  };

  const addCandidateNode = (candidateId: string) => {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      setMessage("Najprej izberite kandidata iz sistema.");
      return;
    }

    const nodeId = `candidate-${candidate.id}-${crypto.randomUUID()}`;
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: "candidate",
        title: candidate.name,
        subtitle: formatCandidateSubtitle(candidate),
        x: snap(360 + current.length * 15),
        y: snap(140 + current.length * 15),
        candidateId: candidate.id,
      },
    ]);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setIsTranscriptPickerOpen(false);
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
    const isTouchBlankPan =
      event.pointerType === "touch" && !target.closest("[data-studio-node], button");

    if (event.button === 2 || event.button === 1 || isTouchBlankPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: viewport.x,
        startY: viewport.y,
      });
      return;
    }

    if (event.button === 0 && !target.closest("[data-studio-node]")) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
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

    const exists = edges.some(
      (edge) =>
        (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId) ||
        (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId),
    );

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

  const transcribeSelectedTranscript = async () => {
    if (!selectedTranscript || !selectedNode?.transcriptId) {
      setMessage("Najprej izberite transkriptni node.");
      return;
    }

    if (selectedTranscript.status === "local" || !selectedTranscript.audioPath) {
      setMessage("Ta transkript nima shranjenega posnetka za transkripcijo.");
      return;
    }

    if (selectedTranscript.status === "complete") {
      setMessage("Ta transkript je že zaključen.");
      return;
    }

    setIsTranscribing(true);
    setMessage("Transkripcija je v teku. To lahko traja nekaj trenutkov.");
    setSavedTranscripts((current) =>
      current.map((transcript) =>
        transcript.id === selectedTranscript.id
          ? { ...transcript, status: "processing", errorMessage: null }
          : transcript,
      ),
    );

    const { data, error } = await supabase.functions.invoke("transcribe-interview", {
      body: {
        transcriptId: selectedTranscript.id,
        confirmedMaxCostUsd: 1,
      },
    });

    setIsTranscribing(false);

    if (error) {
      setSavedTranscripts((current) =>
        current.map((transcript) =>
          transcript.id === selectedTranscript.id
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
      ...selectedTranscript,
      transcriptText: transcriptText || selectedTranscript.transcriptText,
      status: "complete",
      errorMessage: null,
    };

    setSavedTranscripts((current) =>
      current.map((transcript) =>
        transcript.id === selectedTranscript.id ? nextTranscript : transcript,
      ),
    );
    setNodes((current) =>
      current.map((node) =>
        node.transcriptId === selectedTranscript.id
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

  const updateDetailCandidateStage = async () => {
    if (!detailCandidate) {
      setMessage("Kandidat ni izbran.");
      return;
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

  const cost = estimateCost(durationSeconds);
  const isNearLimit = durationSeconds >= warningSeconds;
  const estimatedRecordingBytes = estimateRecordingBytes(durationSeconds);
  const recordedBlobSize = recordingBlobRef.current?.size ?? null;
  const shownRecordingBytes = recordedBlobSize ?? estimatedRecordingBytes;
  const isNearAudioLimit = shownRecordingBytes >= maxAudioBytes * 0.8;
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
    <div className="flex min-h-[calc(100dvh-7.5rem)] w-full max-w-full flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm lg:h-[calc(100vh-7.5rem)] lg:min-h-[620px] lg:flex-row">
      <aside className="flex max-h-[34dvh] w-full shrink-0 flex-col overflow-x-hidden border-b border-border bg-card sm:max-h-[40dvh] lg:max-h-none lg:w-[min(21rem,36vw)] lg:min-w-[18rem] lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Studio razgovorov</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Posnemite razgovor, ustvarite transkript in ga ročno povežite s kandidatom.
              </p>
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
                Potek je ročen zato, da se transkript ne pripiše napačnemu kandidatu.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "1. Ustvari transkript",
                  body: "Posnemite razgovor ali prilepite ročni transkript. Pri posnetku najprej shranite posnetek, nato po potrebi zaženite transkripcijo.",
                  visual: "Transkript",
                },
                {
                  title: "2. Dodaj elemente na mrežo",
                  body: "Z gumboma Dodaj kandidata in Dodaj transkript izberite prava elementa. Oba morata biti vidna na mreži.",
                  visual: "Kandidat + transkript",
                },
                {
                  title: "3. Poveži in shrani",
                  body: "Kliknite Poveži na kandidatu, nato Poveži na transkriptu. Na koncu kliknite Shrani mrežo, da se povezava pokaže na profilu kandidata.",
                  visual: "Shrani mrežo",
                },
              ].map((step) => (
                <div key={step.title} className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-background text-center text-sm font-semibold text-muted-foreground">
                    {step.visual}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4 text-sm leading-relaxed text-cyan-950">
              Ko je mreža shranjena, kandidatov profil prikaže povezane transkripte in primerjavo
              <strong> samo CV</strong> proti <strong>CV + razgovor</strong>. Enak kombiniran signal se pokaže tudi na strani delovnega mesta.
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setIsGuideOpen(false)}>
                Razumem
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4">
          <section className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mic className="h-4 w-4" />
              Snemanje
            </div>
            <div className="grid gap-2">
              <Label>Ime transkripta</Label>
              <Input
                value={transcriptName}
                onChange={(event) => setTranscriptName(event.target.value)}
                placeholder="npr. Razgovor Luka Horvat - UX"
              />
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
              <p className="mt-2 text-xs text-muted-foreground">
                Varovalka: transkripcija se ne zažene samodejno, ime je obvezno, limit je 60 minut in 25 MB.
              </p>
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
              disabled={isSavingRecording || recordingStatus !== "ready" || !transcriptName.trim()}
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

          <section className="grid gap-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Transkripti v sistemu</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Poiščite shranjen posnetek ali zaključen transkript.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={refreshTranscripts}
              >
                Osveži
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={transcriptSearchQuery}
                onChange={(event) => setTranscriptSearchQuery(event.target.value)}
                placeholder="Išči po imenu, statusu ali vsebini..."
                className="pl-9"
              />
            </div>

            <div className="text-xs text-muted-foreground">
              Prikazujem {filteredTranscripts.length} od {savedTranscripts.length} transkriptov.
            </div>

            {filteredTranscripts.length ? (
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {filteredTranscripts.map((transcript) => (
                  <div
                    key={transcript.id}
                    className="rounded-md border border-border bg-muted/25 p-3 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {transcript.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDuration(transcript.durationSeconds)} · {transcript.status}
                      {transcript.audioPath ? " · posnetek" : " · brez posnetka"}
                    </span>
                    {transcript.transcriptText ? (
                      <span className="mt-2 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                        {transcript.transcriptText}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Ni shranjenih transkriptov za ta iskalni niz. Posnemite razgovor ali osvežite seznam.
              </div>
            )}
          </section>

          <section className="grid gap-3 border-t border-border pt-5">
            <div>
              <div className="text-sm font-semibold text-foreground">Ročno ustvari transkript</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Samo za obstoječe zapiske ali testni vnos, ne za iskanje shranjenih transkriptov.
              </p>
            </div>
            <Input
              value={manualTranscriptName}
              onChange={(event) => setManualTranscriptName(event.target.value)}
              placeholder="Ime novega ročnega transkripta"
            />
            <Textarea
              value={manualTranscriptText}
              onChange={(event) => setManualTranscriptText(event.target.value)}
              placeholder="Prilepite besedilo transkripta, če ga že imate."
              className="min-h-24 resize-y"
            />
            <Button type="button" variant="outline" onClick={addManualTranscript} className="gap-2">
              <Plus className="h-4 w-4" />
              Ustvari transkript
            </Button>
          </section>

          <section className="grid gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">Povezovanje</div>
            <p>Kliknite Poveži na prvem node-u, nato Poveži na drugem node-u.</p>
            <p>Manager povezave potrjuje ročno, zato se razgovor ne pripiše napačnemu kandidatu.</p>
          </section>
        </div>
      </aside>

      <main className="relative h-[72dvh] min-h-[34rem] min-w-0 flex-1 overflow-hidden bg-background lg:h-auto lg:min-h-0">
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-wrap items-start gap-2 lg:left-4 lg:right-72 lg:top-4 lg:gap-3">
          <div className="pointer-events-auto max-w-full rounded-md border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm lg:max-w-[34rem]">
            {gridSize}px mreža · 5px premik · {nodes.length} elementov · {edges.length} povezav
            {" · "}
            {Math.round(viewport.zoom * 100)}%
            {" · desni klik + poteg za premik"}
            {connectingFromNodeId ? " · izberite drugi element" : ""}
            {selectedEdge ? " · povezava izbrana" : ""}
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
                    {candidates.map((candidate) => (
                      <CommandItem
                        key={candidate.id}
                        value={`${candidate.name} ${candidate.role} ${stageLabels[candidate.stage]}`}
                        onSelect={() => addCandidateNode(candidate.id)}
                      >
                        <Users className="h-4 w-4 text-cyan-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{candidate.name}</span>
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
                onClick={() => setViewport(defaultViewport)}
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
              disabled={isSavingBoard}
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
              onClick={transcribeSelectedTranscript}
              disabled={
                isTranscribing ||
                selectedTranscript == null ||
                selectedTranscript.status === "local" ||
                selectedTranscript.status === "processing" ||
                selectedTranscript.status === "complete" ||
                !selectedTranscript.audioPath
              }
              className="justify-center gap-2 px-2 lg:justify-start"
            >
              {isTranscribing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              <span className="lg:hidden">AI</span>
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
          {boardTableMissing ? (
            <p className="mt-2 hidden rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 lg:block">
              Za trajno shrambo najprej zaženite SQL za <code>interview_studio_boards</code>.
            </p>
          ) : null}
          {transcriptTableMissing ? (
            <p className="mt-2 hidden rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 lg:block">
              Za posnetke in AI transkripte zaženite SQL za <code>interview_transcripts</code>.
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
            panState ? "cursor-grabbing" : "cursor-default"
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
          ) : nodes.length === 0 ? (
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
              {edges.map((edge) => {
                const fromNode = nodes.find((node) => node.id === edge.fromNodeId);
                const toNode = nodes.find((node) => node.id === edge.toNodeId);
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

            {nodes.map((node) => (
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
