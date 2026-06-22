// Single source of truth for match-score colour banding so the score reads the
// same everywhere it appears (list rows, rings, dashboard, search).
// Brief: ≥80 strong (green), 60–79 medium (amber), <60 weak (muted/grey).

export type ScoreBand = "strong" | "medium" | "weak";

export const scoreBand = (score: number): ScoreBand =>
  score >= 80 ? "strong" : score >= 60 ? "medium" : "weak";

/** Text colour per band (for inline figures). */
export const scoreBandText: Record<ScoreBand, string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  weak: "text-muted-foreground",
};

/** Ring/stroke colour per band (currentColor-driven SVG). */
export const scoreBandRing: Record<ScoreBand, string> = {
  strong: "text-emerald-500",
  medium: "text-amber-500",
  weak: "text-muted-foreground",
};

/** Filled chip background + text per band. */
export const scoreBandChip: Record<ScoreBand, string> = {
  strong: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  weak: "bg-muted text-muted-foreground",
};
