import { type ReactNode } from "react";

import { cn } from "../ui/utils";

export type StatItem = {
  label: string;
  value: ReactNode;
  detail?: string;
};

const columnClass: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6",
};

/**
 * One calm KPI strip: a single surface split by hairline dividers instead of a
 * row of separate bordered boxes. Reused across Dashboard / Offers / workflow.
 */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  const cols = columnClass[items.length] ?? "sm:grid-cols-3";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className={cn("grid grid-cols-2 divide-x divide-y divide-border", cols)}>
        {items.map((item) => (
          <div key={item.label} className="p-4">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
            {item.detail ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
