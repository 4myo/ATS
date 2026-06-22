import { type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { cn } from "../ui/utils";

export type Breadcrumb = { label: string; to?: string };

interface DynamicPageHeaderProps {
  /** Page / object title. */
  title: ReactNode;
  /** Secondary line under the title (e.g. "Applied for Frontend Engineer"). */
  subtitle?: ReactNode;
  /** Breadcrumb trail for return-to-worklist navigation. */
  breadcrumbs?: Breadcrumb[];
  /** Back affordance — shown as a leading arrow button when provided. */
  onBack?: () => void;
  backLabel?: string;
  /** Compact key-fact row beneath the title (contact pills, location, etc.). */
  meta?: ReactNode;
  /** Status indicator shown in the trailing cluster. */
  status?: ReactNode;
  /** Header-level actions (buttons). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Fiori-style dynamic page header: a flat, borderless-bottom strip with an
 * optional breadcrumb row, a title block (with key facts), and a trailing
 * cluster for status + contextual actions. Used by both list reports and
 * object pages so every page leads with the same anatomy.
 */
export function DynamicPageHeader({
  title,
  subtitle,
  breadcrumbs,
  onBack,
  backLabel = "Back",
  meta,
  status,
  actions,
  className,
}: DynamicPageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {crumb.to && !isLast ? (
                  <Link to={crumb.to} className="transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(isLast && "text-foreground")}>{crumb.label}</span>
                )}
                {!isLast ? <ChevronRight className="h-3 w-3 opacity-60" /> : null}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="mt-0.5 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="page-title break-words">{title}</h1>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            {meta ? <div className="mt-2">{meta}</div> : null}
          </div>
        </div>

        {status || actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {status}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
