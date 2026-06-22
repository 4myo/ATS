import type { Stage } from "../store";

/**
 * Single source of truth for candidate pipeline progression.
 *
 * Every module (candidate detail, interviews, offers, headhunter, interview
 * flow) should consult this machine instead of hand-rolling stage rules — that
 * keeps the guided workflow identical everywhere and prevents invalid moves
 * such as silently backtracking an Accepted candidate.
 */

/** Ordered main-line of the pipeline shown in the stepper rail. */
export const WORKFLOW_STAGES: Stage[] = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
];

/** Stages that close the candidate out and must be explicitly reopened. */
export const TERMINAL_STAGES: Stage[] = ["Accepted", "Rejected"];

export const isTerminalStage = (stage: Stage): boolean =>
  TERMINAL_STAGES.includes(stage);

export const stageIndex = (stage: Stage): number =>
  WORKFLOW_STAGES.indexOf(stage);

/** The immediate next main-line stage, or null at the end / off-line. */
export const nextStage = (stage: Stage): Stage | null => {
  const index = stageIndex(stage);
  if (index < 0 || index >= WORKFLOW_STAGES.length - 1) return null;
  return WORKFLOW_STAGES[index + 1];
};

export type TransitionKind =
  | "same"
  | "advance"
  | "backward"
  | "reopen"
  | "reject"
  | "blocked";

export type TransitionCheck = {
  /** Whether the move may happen at all. */
  allowed: boolean;
  /** Whether the move should prompt the user before committing. */
  requiresConfirm: boolean;
  kind: TransitionKind;
};

/**
 * Strict-guided policy:
 *  - advance only to the immediate next stage (no skipping ahead),
 *  - rejection is always available but confirmed,
 *  - moving backward is allowed but confirmed,
 *  - a terminal candidate is locked until explicitly reopened (confirmed).
 */
export function checkTransition(from: Stage, to: Stage): TransitionCheck {
  if (from === to) {
    return { allowed: false, requiresConfirm: false, kind: "same" };
  }

  // A finished candidate must be reopened on purpose.
  if (isTerminalStage(from)) {
    return { allowed: true, requiresConfirm: true, kind: "reopen" };
  }

  // Rejection is a deliberate decision from any active stage.
  if (to === "Rejected") {
    return { allowed: true, requiresConfirm: true, kind: "reject" };
  }

  const fromIndex = stageIndex(from);
  const toIndex = stageIndex(to);

  if (toIndex < fromIndex) {
    return { allowed: true, requiresConfirm: true, kind: "backward" };
  }

  if (toIndex === fromIndex + 1) {
    return { allowed: true, requiresConfirm: false, kind: "advance" };
  }

  // Skipping more than one stage ahead is not permitted.
  return { allowed: false, requiresConfirm: false, kind: "blocked" };
}

/** Convenience guard used by stepper steps / action buttons. */
export const canSelectStage = (from: Stage, to: Stage): boolean =>
  checkTransition(from, to).allowed;
