import { clsx } from "clsx";

import { scoreBand, scoreBandChip } from "../lib/score";

interface ScoreChipProps {
  /** 0–100 match score, or null when not yet scored. */
  score: number | null | undefined;
  /** Label shown when there is no score. */
  emptyLabel?: string;
  className?: string;
}

/**
 * Bold, colour-banded match-score chip — the visual anchor for a candidate's
 * fit. Greater weight than surrounding metadata, consistent everywhere.
 */
export function ScoreChip({ score, emptyLabel = "—", className }: ScoreChipProps) {
  if (typeof score !== "number") {
    return (
      <span
        className={clsx(
          "inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        {emptyLabel}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold tabular-nums",
        scoreBandChip[scoreBand(score)],
        className,
      )}
    >
      {Math.round(score)}%
    </span>
  );
}
