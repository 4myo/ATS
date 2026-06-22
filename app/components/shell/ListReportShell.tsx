import { type ReactNode } from "react";

import { cn } from "../ui/utils";
import { DynamicPageHeader, type Breadcrumb } from "./DynamicPageHeader";

export type StatusTab = {
  key: string;
  label: string;
  /** Optional count shown as a trailing pill. */
  count?: number;
};

interface ListReportShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  /** Segmented status tabs (All / Needs review / Interview / …). */
  tabs?: StatusTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Filter / search controls shown beneath the tabs. */
  filters?: ReactNode;
  /** The list / table content. */
  children: ReactNode;
  className?: string;
}

/**
 * Fiori list-report scaffold: dynamic header, a segmented status-tab strip
 * with live counts, an optional filter region, and the worklist body. Gives
 * every list page (candidates, jobs, offers, …) the same predictable anatomy.
 */
export function ListReportShell({
  title,
  subtitle,
  breadcrumbs,
  actions,
  tabs,
  activeTab,
  onTabChange,
  filters,
  children,
  className,
}: ListReportShellProps) {
  return (
    <div className={cn("page-container", className)}>
      <DynamicPageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs}
        actions={actions}
      />

      {tabs?.length ? (
        <div
          role="tablist"
          aria-label="Status"
          className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-1"
        >
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange?.(tab.key)}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
                {typeof tab.count === "number" ? (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px text-xs font-semibold tabular-nums",
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {filters ? <div className="grid gap-3">{filters}</div> : null}

      {children}
    </div>
  );
}
