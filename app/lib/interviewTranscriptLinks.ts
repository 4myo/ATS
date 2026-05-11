import { supabase } from "./supabase";

type BoardNode = {
  id: string;
  type: "candidate" | "transcript";
  candidateId?: string;
  transcriptId?: string;
  transcriptText?: string;
  title?: string;
};

type BoardEdge = {
  fromNodeId: string;
  toNodeId: string;
};

type BoardTranscript = {
  id: string;
  title: string;
  transcriptText: string;
  durationSeconds: number;
  createdAt: string;
  status: string;
};

type TranscriptRow = {
  id: string;
  title: string | null;
  transcript_text: string | null;
  duration_seconds: number | null;
  status: string | null;
  created_at: string | null;
};

export type LinkedCandidateTranscript = {
  id: string;
  title: string;
  transcriptText: string;
  durationSeconds: number;
  createdAt: string;
  status: string;
};

const isMissingRelationTableError = (error?: { message?: string; details?: string } | null) =>
  Boolean(
    error?.message?.includes("candidate_interview_transcripts") ||
      error?.details?.includes("candidate_interview_transcripts") ||
      error?.message?.includes("Could not find the table"),
  );

export type InterviewComparisonInsight = {
  transcriptCount: number;
  transcriptMatchScore: number | null;
  combinedScore: number | null;
  matchedTerms: string[];
  summary: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeNodes = (value: unknown): BoardNode[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item): BoardNode => {
      const type: BoardNode["type"] = item.type === "candidate" ? "candidate" : "transcript";

      return {
        id: String(item.id ?? ""),
        type,
        candidateId: typeof item.candidateId === "string" ? item.candidateId : undefined,
        transcriptId: typeof item.transcriptId === "string" ? item.transcriptId : undefined,
        transcriptText:
          typeof item.transcriptText === "string" ? item.transcriptText : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
      };
    })
    .filter((node) => node.id);
};

const normalizeEdges = (value: unknown): BoardEdge[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      fromNodeId: String(item.fromNodeId ?? ""),
      toNodeId: String(item.toNodeId ?? ""),
    }))
    .filter((edge) => edge.fromNodeId && edge.toNodeId);
};

const normalizeBoardTranscripts = (value: unknown): BoardTranscript[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      id: String(item.id ?? ""),
      title: String(item.title ?? "Transkript"),
      transcriptText: String(item.transcriptText ?? ""),
      durationSeconds: Number(item.durationSeconds ?? 0),
      createdAt: String(item.createdAt ?? ""),
      status: String(item.status ?? "local"),
    }))
    .filter((transcript) => transcript.id);
};

const fromTranscriptRow = (
  row: TranscriptRow,
  fallback?: Partial<LinkedCandidateTranscript>,
): LinkedCandidateTranscript => ({
  id: row.id,
  title: row.title?.trim() || fallback?.title || "Transkript razgovora",
  transcriptText:
    row.transcript_text?.trim() || fallback?.transcriptText || "",
  durationSeconds: Number(row.duration_seconds ?? fallback?.durationSeconds ?? 0),
  createdAt: row.created_at || fallback?.createdAt || "",
  status: row.status || fallback?.status || "local",
});

export const fetchLinkedCandidateTranscripts = async (candidateIds: string[]) => {
  const uniqueCandidateIds = [...new Set(candidateIds.filter(Boolean))];
  const result: Record<string, LinkedCandidateTranscript[]> = {};
  uniqueCandidateIds.forEach((candidateId) => {
    result[candidateId] = [];
  });

  if (!uniqueCandidateIds.length) return result;

  const { data: relationRows, error: relationError } = await supabase
    .from("candidate_interview_transcripts")
    .select(
      "candidate_id, interview_transcripts(id, title, transcript_text, duration_seconds, status, created_at)",
    )
    .in("candidate_id", uniqueCandidateIds);

  if (!relationError && relationRows?.length) {
    for (const row of relationRows as Array<Record<string, unknown>>) {
      const candidateId = String(row.candidate_id ?? "");
      const transcript = row.interview_transcripts;
      if (!candidateId || !result[candidateId] || !isRecord(transcript)) continue;

      result[candidateId].push(
        fromTranscriptRow({
          id: String(transcript.id ?? ""),
          title: typeof transcript.title === "string" ? transcript.title : null,
          transcript_text:
            typeof transcript.transcript_text === "string"
              ? transcript.transcript_text
              : null,
          duration_seconds:
            typeof transcript.duration_seconds === "number"
              ? transcript.duration_seconds
              : null,
          status: typeof transcript.status === "string" ? transcript.status : null,
          created_at:
            typeof transcript.created_at === "string" ? transcript.created_at : null,
        }),
      );
    }

    return result;
  }

  if (relationError && !isMissingRelationTableError(relationError)) {
    return result;
  }

  const { data: boards, error } = await supabase
    .from("interview_studio_boards")
    .select("nodes, edges, transcripts");

  if (error || !boards?.length) return result;

  const transcriptIds = new Set<string>();
  const transcriptIdByCandidate = new Map<string, Set<string>>();
  const fallbackByTranscriptId = new Map<string, LinkedCandidateTranscript>();

  for (const board of boards as Array<Record<string, unknown>>) {
    const nodes = normalizeNodes(board.nodes);
    const edges = normalizeEdges(board.edges);
    const boardTranscripts = normalizeBoardTranscripts(board.transcripts);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const boardTranscriptById = new Map(boardTranscripts.map((item) => [item.id, item]));

    for (const edge of edges) {
      const left = nodeById.get(edge.fromNodeId);
      const right = nodeById.get(edge.toNodeId);
      const candidateNode = left?.type === "candidate" ? left : right?.type === "candidate" ? right : null;
      const transcriptNode = left?.type === "transcript" ? left : right?.type === "transcript" ? right : null;
      const candidateId = candidateNode?.candidateId;
      const transcriptId = transcriptNode?.transcriptId;

      if (!candidateId || !transcriptId || !result[candidateId]) continue;

      transcriptIds.add(transcriptId);
      if (!transcriptIdByCandidate.has(candidateId)) {
        transcriptIdByCandidate.set(candidateId, new Set());
      }
      transcriptIdByCandidate.get(candidateId)?.add(transcriptId);

      const fallback = boardTranscriptById.get(transcriptId);
      fallbackByTranscriptId.set(transcriptId, {
        id: transcriptId,
        title: fallback?.title || transcriptNode?.title || "Transkript razgovora",
        transcriptText: fallback?.transcriptText || transcriptNode?.transcriptText || "",
        durationSeconds: fallback?.durationSeconds || 0,
        createdAt: fallback?.createdAt || "",
        status: fallback?.status || "local",
      });
    }
  }

  const persistedById = new Map<string, LinkedCandidateTranscript>();
  if (transcriptIds.size) {
    const { data: transcriptRows } = await supabase
      .from("interview_transcripts")
      .select("id, title, transcript_text, duration_seconds, status, created_at")
      .in("id", [...transcriptIds]);

    for (const row of (transcriptRows ?? []) as TranscriptRow[]) {
      persistedById.set(row.id, fromTranscriptRow(row, fallbackByTranscriptId.get(row.id)));
    }
  }

  for (const candidateId of uniqueCandidateIds) {
    const ids = [...(transcriptIdByCandidate.get(candidateId) ?? [])];
    result[candidateId] = ids
      .map((transcriptId) => persistedById.get(transcriptId) ?? fallbackByTranscriptId.get(transcriptId))
      .filter(Boolean) as LinkedCandidateTranscript[];
  }

  return result;
};

export const syncCandidateTranscriptLinks = async (input: {
  userId: string;
  candidateTranscriptPairs: Array<{ candidateId: string; transcriptId: string }>;
}) => {
  const uniquePairs = [
    ...new Map(
      input.candidateTranscriptPairs
        .filter((pair) => pair.candidateId && pair.transcriptId)
        .map((pair) => [`${pair.candidateId}:${pair.transcriptId}`, pair]),
    ).values(),
  ];

  const { error: deleteError } = await supabase
    .from("candidate_interview_transcripts")
    .delete()
    .eq("user_id", input.userId);

  if (deleteError) {
    return { ok: false, missingTable: isMissingRelationTableError(deleteError), error: deleteError };
  }

  if (!uniquePairs.length) {
    return { ok: true, missingTable: false, error: null };
  }

  const { error: insertError } = await supabase
    .from("candidate_interview_transcripts")
    .insert(
      uniquePairs.map((pair) => ({
        user_id: input.userId,
        candidate_id: pair.candidateId,
        transcript_id: pair.transcriptId,
      })),
    );

  return {
    ok: !insertError,
    missingTable: isMissingRelationTableError(insertError),
    error: insertError,
  };
};

const normalizeTerms = (values: Array<string | null | undefined>) =>
  [
    ...new Set(
      values
        .flatMap((value) => String(value ?? "").split(/[^A-Za-zÀ-ž0-9+#.]+/))
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length >= 3 && !["the", "and", "ali", "ter", "for", "with", "delo"].includes(term)),
    ),
  ].slice(0, 24);

export const buildInterviewComparisonInsight = (input: {
  cvScore?: number | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  skills?: string[] | null;
  transcripts: LinkedCandidateTranscript[];
}): InterviewComparisonInsight => {
  const transcripts = input.transcripts.filter((item) => item.transcriptText.trim());
  if (!transcripts.length) {
    return {
      transcriptCount: input.transcripts.length,
      transcriptMatchScore: null,
      combinedScore: input.cvScore ?? null,
      matchedTerms: [],
      summary: "S kandidatom še ni povezanega zaključenega transkripta za primerjavo s CV analizo.",
    };
  }

  const combinedText = transcripts.map((item) => item.transcriptText).join("\n").toLowerCase();
  const terms = normalizeTerms([
    input.jobTitle,
    input.jobDescription,
    ...(input.skills ?? []),
  ]);
  const matchedTerms = terms.filter((term) => combinedText.includes(term)).slice(0, 10);
  const coverage = terms.length ? matchedTerms.length / terms.length : 0;
  const transcriptMatchScore = Math.max(
    20,
    Math.min(100, Math.round(35 + coverage * 55 + Math.min(10, transcripts.length * 4))),
  );
  const cvScore =
    typeof input.cvScore === "number" && Number.isFinite(input.cvScore)
      ? input.cvScore
      : null;
  const combinedScore =
    cvScore == null
      ? transcriptMatchScore
      : Math.round(cvScore * 0.65 + transcriptMatchScore * 0.35);

  return {
    transcriptCount: input.transcripts.length,
    transcriptMatchScore,
    combinedScore,
    matchedTerms,
    summary:
      matchedTerms.length > 0
        ? `Transkript potrjuje ${matchedTerms.length} pomembnih izrazov iz vloge/CV-ja. Primerjava pomaga ločiti CV dokazila od dokazil iz razgovora.`
        : "Transkript je povezan, vendar v njem ni veliko neposrednih izrazov iz vloge/CV-ja. Priporočljiv je ročni pregled vsebine razgovora.",
  };
};
