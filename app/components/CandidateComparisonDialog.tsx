import { Link } from "react-router";

import type { Applicant } from "../store";
import { useI18n } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScoreChip } from "./ScoreChip";

interface CandidateComparisonDialogProps {
  candidates: Applicant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase() || "?";
}

export function CandidateComparisonDialog({
  candidates,
  open,
  onOpenChange,
  returnTo,
}: CandidateComparisonDialogProps) {
  const { stageLabel, tt } = useI18n();
  const columnCount = Math.max(candidates.length, 2);
  const columns = `8rem repeat(${columnCount}, minmax(16rem, 1fr))`;
  // Bound the table width by the column mins (not by the longest text) so the
  // summary wraps inside its column instead of stretching the whole grid.
  const gridMinWidth = `calc(8rem + ${columnCount} * 16rem)`;

  const rows = [
    {
      label: tt("Ocena ujemanja"),
      render: (candidate: Applicant) => <ScoreChip score={candidate.aiScore} emptyLabel="—" />,
    },
    {
      label: tt("Faza"),
      render: (candidate: Applicant) => <Badge variant="secondary">{stageLabel(candidate.stage)}</Badge>,
    },
    {
      label: tt("Izkušnje"),
      render: (candidate: Applicant) => `${candidate.experience || 0} ${tt("let")}`,
    },
    {
      label: tt("Lokacija"),
      render: (candidate: Applicant) => candidate.location || "—",
    },
    {
      label: tt("Veščine"),
      render: (candidate: Applicant) => (
        <div className="flex flex-wrap gap-1.5">
          {(candidate.skills ?? []).slice(0, 6).map((skill) => (
            <span key={skill} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">{skill}</span>
          ))}
          {!candidate.skills?.length ? "—" : null}
        </div>
      ),
    },
    {
      label: tt("Prednosti"),
      render: (candidate: Applicant) => (
        <ul className="space-y-1 text-xs leading-relaxed text-foreground">
          {(candidate.analysisStrengths?.length ? candidate.analysisStrengths : candidate.matchAnalysis.pros).slice(0, 4).map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ),
    },
    {
      label: tt("Tveganja"),
      render: (candidate: Applicant) => (
        <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          {(candidate.analysisConcerns?.length ? candidate.analysisConcerns : candidate.matchAnalysis.cons).slice(0, 4).map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ),
    },
    {
      label: tt("Povzetek"),
      render: (candidate: Applicant) => candidate.summary || tt("Povzetek še ni pripravljen."),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1480px)] max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{tt("Primerjava kandidatov")}</DialogTitle>
          <DialogDescription>
            {tt("Primerjaj oceno, izkušnje, veščine, prednosti in tveganja v enem pogledu.")}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto">
          <div style={{ minWidth: gridMinWidth }}>
            <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: columns }}>
              <div className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {candidates.length} {tt("izbranih")}
              </div>
              {candidates.map((candidate) => (
                <div key={candidate.id} className="border-l border-border px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {initials(candidate.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{candidate.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{candidate.role}</span>
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to={`/applicants/${candidate.id}?returnTo=${encodeURIComponent(returnTo)}`} state={{ returnTo }}>
                      {tt("Odpri profil")}
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {rows.map((row) => (
              <div key={row.label} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: columns }}>
                <div className="bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </div>
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="border-l border-border px-4 py-3 text-sm text-foreground">
                    {row.render(candidate)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
