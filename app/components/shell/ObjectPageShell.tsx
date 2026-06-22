import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../ui/utils";

export type ObjectPageAnchor = { id: string; label: string };

interface ObjectPageShellProps {
  /** A <DynamicPageHeader /> element. */
  header: ReactNode;
  /** Optional workflow rail shown between the header and the anchor nav. */
  stepper?: ReactNode;
  /** Anchor targets for the sticky scroll-spy nav. Each id must match an
   *  element id inside `children`. */
  anchors?: ObjectPageAnchor[];
  /** Render the navigation as controlled content tabs instead of scroll anchors. */
  navigationMode?: "anchors" | "tabs";
  activeSection?: string;
  onSectionChange?: (id: string) => void;
  /** Sticky footer action bar (primary contextual actions). */
  footer?: ReactNode;
  /** Object-page body. Section wrappers should carry id + `scroll-mt-4`. */
  children: ReactNode;
  className?: string;
}

/**
 * Fiori object-page scaffold: a pinned dynamic header, a sticky scroll-spy
 * anchor bar that tracks the section in view, a scrollable content region, and
 * a sticky footer action bar. The page supplies its own sections (tagged with
 * matching ids) so existing content keeps its structure while gaining the
 * predictable object-page chrome.
 */
export function ObjectPageShell({
  header,
  stepper,
  anchors,
  navigationMode = "anchors",
  activeSection,
  onSectionChange,
  footer,
  children,
  className,
}: ObjectPageShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(anchors?.[0]?.id ?? "");
  const visibleIds = useRef<Set<string>>(new Set());

  // Scroll-spy: highlight the anchor for the topmost section in view.
  useEffect(() => {
    const container = scrollRef.current;
    if (navigationMode === "tabs" || !container || !anchors?.length) return;

    const elements = anchors
      .map((anchor) => container.querySelector<HTMLElement>(`#${CSS.escape(anchor.id)}`))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.current.add(entry.target.id);
          else visibleIds.current.delete(entry.target.id);
        }
        const topmost = anchors.find((anchor) => visibleIds.current.has(anchor.id));
        if (topmost) setActiveId(topmost.id);
      },
      { root: container, rootMargin: "0px 0px -68% 0px", threshold: [0, 1] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [anchors, navigationMode]);

  const scrollToSection = useCallback((id: string) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!container || !target) return;

    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    setActiveId(id);
  }, []);

  const selectedId = navigationMode === "tabs" ? activeSection : activeId;

  const selectSection = (id: string) => {
    if (navigationMode === "tabs") {
      onSectionChange?.(id);
      return;
    }
    scrollToSection(id);
  };

  return (
    <div className={cn("flex min-h-full flex-col bg-background", className)}>
      <div className="flex-none border-b border-border bg-card px-4 pt-4 pb-3 sm:px-6 lg:px-8">
        {header}

        {stepper ? (
          <div className="mt-4 border-t border-border pt-3">{stepper}</div>
        ) : null}

        {anchors?.length ? (
          <nav
            aria-label="Sections"
            role={navigationMode === "tabs" ? "tablist" : undefined}
            className="scrollbar-hidden mt-3 -mb-3 flex flex-wrap items-center gap-1 overflow-x-auto"
          >
            {anchors.map((anchor) => {
              const isActive = anchor.id === selectedId;
              return (
                <button
                  key={anchor.id}
                  id={`${anchor.id}-tab`}
                  type="button"
                  onClick={() => selectSection(anchor.id)}
                  role={navigationMode === "tabs" ? "tab" : undefined}
                  aria-selected={navigationMode === "tabs" ? isActive : undefined}
                  aria-controls={navigationMode === "tabs" ? anchor.id : undefined}
                  aria-current={navigationMode === "anchors" && isActive ? "true" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {anchor.label}
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-8"
      >
        {children}
      </div>

      {footer ? (
        <div className="flex-none border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-end gap-3">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}
