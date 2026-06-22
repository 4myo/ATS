import type { Stage } from "../store";

const stageRank = {
  Applied: 1,
  Screening: 2,
  Interview: 3,
  Offer: 4,
  Accepted: 5,
  Rejected: 6,
} satisfies Record<Stage, number>;

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

// Identity is scoped to a single job: the same person applying to a DIFFERENT
// job stays as a separate, job-labelled row, but the same person + same job is
// treated as one application even when résumés were uploaded twice (different
// resume_path). This is why job is part of every key and resume_path is not.
const candidateIdentityKey = (row: Record<string, unknown>) => {
  const jobTitle = normalizeText(row.job_title);

  const email = normalizeText(row.email);
  if (email) return `email-job:${email}:${jobTitle}`;

  const name = normalizeText(row.full_name);
  return `name-job:${name}:${jobTitle}`;
};

const rowTime = (row: Record<string, unknown>) => {
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  const time = Date.parse(createdAt);
  return Number.isNaN(time) ? 0 : time;
};

const shouldReplaceCandidateRow = (
  current: Record<string, unknown>,
  next: Record<string, unknown>,
) => {
  const currentTime = rowTime(current);
  const nextTime = rowTime(next);

  if (nextTime !== currentTime) {
    return nextTime > currentTime;
  }

  const currentStage = current.stage as Stage;
  const nextStage = next.stage as Stage;
  const currentRank = stageRank[currentStage] ?? 0;
  const nextRank = stageRank[nextStage] ?? 0;
  if (nextRank !== currentRank) {
    return nextRank > currentRank;
  }

  // Same recency and stage: keep the better-scored application.
  const currentScore = typeof current.ats_score === "number" ? current.ats_score : -1;
  const nextScore = typeof next.ats_score === "number" ? next.ats_score : -1;
  return nextScore > currentScore;
};

export const dedupeCandidateRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
) => {
  const byIdentity = new Map<string, TRow>();
  const withoutIdentity: TRow[] = [];

  rows.forEach((row) => {
    const identity = candidateIdentityKey(row);

    if (identity === "name-job::") {
      withoutIdentity.push(row);
      return;
    }

    const existing = byIdentity.get(identity);
    if (!existing || shouldReplaceCandidateRow(existing, row)) {
      byIdentity.set(identity, row);
    }
  });

  return [...byIdentity.values(), ...withoutIdentity].sort(
    (left, right) => rowTime(right) - rowTime(left),
  );
};
