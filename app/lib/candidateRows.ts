import type { Stage } from "../store";

const stageRank = {
  Applied: 1,
  Screening: 2,
  Interview: 3,
  Offer: 4,
  Rejected: 5,
} satisfies Record<Stage, number>;

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const candidateIdentityKey = (row: Record<string, unknown>) => {
  const resumePath = normalizeText(row.resume_path);
  if (resumePath) return `resume:${resumePath}`;

  const email = normalizeText(row.email);
  if (email) return `email:${email}`;

  const name = normalizeText(row.full_name);
  const jobTitle = normalizeText(row.job_title);
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
  return (stageRank[nextStage] ?? 0) > (stageRank[currentStage] ?? 0);
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

