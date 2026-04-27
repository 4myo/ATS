type AiWritingSignalInput = {
  name?: string | null;
  role?: string | null;
  summary?: string | null;
  analysisSummary?: string | null;
  strengths?: string[] | null;
  concerns?: string[] | null;
  skills?: string[] | null;
  yearsExperience?: number | null;
  atsScore?: number | null;
};

type AiWritingSignal = {
  score: number;
  label: string;
  tone: "low" | "medium" | "high";
  notes: string[];
};

const polishedPhrases = [
  "proven track record",
  "cross-functional",
  "results-driven",
  "high-quality results",
  "fast-paced",
  "dynamic environment",
  "adept at",
  "passion for",
  "strong background",
  "collaborated with",
  "delivering",
  "business goals",
];

export function getAiWritingSignal(input: AiWritingSignalInput): AiWritingSignal {
  const combinedText = [
    input.summary,
    input.analysisSummary,
    ...(input.strengths ?? []),
    ...(input.concerns ?? []),
    ...(input.skills ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const phraseHits = polishedPhrases.filter((phrase) =>
    combinedText.includes(phrase),
  ).length;
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
  const commaCount = (combinedText.match(/,/g) ?? []).length;
  const bulletLikeCount = (input.strengths?.length ?? 0) + (input.concerns?.length ?? 0);
  const skillsCount = input.skills?.length ?? 0;

  let score = 18;
  score += Math.min(phraseHits * 9, 36);
  score += wordCount > 80 ? 14 : wordCount > 40 ? 8 : 0;
  score += commaCount >= 6 ? 8 : commaCount >= 3 ? 4 : 0;
  score += bulletLikeCount >= 5 ? 8 : bulletLikeCount >= 3 ? 4 : 0;
  score += skillsCount >= 8 ? 6 : skillsCount >= 5 ? 3 : 0;

  if ((input.yearsExperience ?? 0) === 0 && (input.atsScore ?? 0) >= 75) {
    score += 6;
  }

  score = Math.max(4, Math.min(96, Math.round(score)));

  const tone = score >= 68 ? "high" : score >= 38 ? "medium" : "low";
  const label =
    tone === "high"
      ? "High AI-writing signal"
      : tone === "medium"
        ? "Mixed authorship signal"
        : "Low AI-writing signal";

  const notes = [
    phraseHits > 0
      ? `${phraseHits} polished or template-like phrase${phraseHits === 1 ? "" : "s"} found`
      : "Few obvious template phrases found",
    wordCount > 40
      ? "Summary and analysis read consistently structured"
      : "Limited text available for this estimate",
    "Use as a review cue, not proof of AI authorship",
  ];

  return { score, label, tone, notes };
}
