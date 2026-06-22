import { Check } from "lucide-react";

import type { Stage } from "../../store";
import {
  WORKFLOW_STAGES,
  canSelectStage,
  stageIndex,
} from "../../lib/candidateWorkflow";
import { cn } from "../ui/utils";

interface WorkflowStepperProps {
  /** The candidate's current stage. */
  current: Stage;
  /** Localised label for a stage. */
  getLabel: (stage: Stage) => string;
  /** Invoked when a (selectable) step is clicked — parent applies the rules. */
  onSelect: (stage: Stage) => void;
  className?: string;
}

/**
 * Horizontal stage rail (Applied → Screening → Interview → Offer → Accepted).
 * Completed stages show a check, the current one is highlighted, and only the
 * steps the workflow machine permits are clickable — so the rail itself teaches
 * the allowed path. A rejected candidate is shown as an off-line terminal pill.
 */
export function WorkflowStepper({
  current,
  getLabel,
  onSelect,
  className,
}: WorkflowStepperProps) {
  const currentIndex = stageIndex(current); // -1 when rejected / off-line
  const isRejected = current === "Rejected";

  return (
    <ol className={cn("scrollbar-hidden flex w-full items-center overflow-x-auto", className)}>
      {WORKFLOW_STAGES.map((stage, index) => {
        const isCurrent = stage === current;
        const isDone = currentIndex >= 0 && index < currentIndex;
        const clickable = canSelectStage(current, stage);
        const isLast = index === WORKFLOW_STAGES.length - 1;

        return (
          <li key={stage} className="flex min-w-0 flex-1 items-center">
            <button
              type="button"
              disabled={!clickable}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => clickable && onSelect(stage)}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isCurrent && "bg-primary/10 text-foreground",
                !isCurrent && isDone && "text-foreground",
                !isCurrent && !isDone && "text-muted-foreground",
                clickable ? "cursor-pointer hover:bg-muted" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent && "bg-primary text-primary-foreground",
                  isDone && "bg-emerald-500 text-white",
                  !isCurrent && !isDone && "border border-border text-muted-foreground",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {/* On narrow screens only the current step keeps its label. */}
              <span className={cn("truncate", !isCurrent && "hidden sm:inline")}>
                {getLabel(stage)}
              </span>
            </button>

            {!isLast ? (
              <span
                className={cn(
                  "mx-1 h-px min-w-3 flex-1",
                  index < currentIndex ? "bg-emerald-500/50" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}

      {isRejected ? (
        <li className="ml-2 shrink-0">
          <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400">
            {getLabel("Rejected")}
          </span>
        </li>
      ) : null}
    </ol>
  );
}
