import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Link as LinkIcon, MoreHorizontal, Trash2 } from "lucide-react";

import type { Applicant, Stage } from "../store";
import { useI18n } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScoreChip } from "./ScoreChip";
import { Checkbox } from "./ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { getShortCandidateId } from "../lib/candidateIdentity";

interface ApplicantWorkTableProps {
  applicants: Applicant[];
  returnTo: string;
  onDelete: (id: string) => void;
  onMarkNewReviewed: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelection: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
}

const nextActionByStage: Record<Stage, string> = {
  Applied: "Preglej prijavo",
  Screening: "Zaključi pregled",
  Interview: "Pripravi razgovor",
  Offer: "Preveri ponudbo",
  Accepted: "Zaključi zaposlitev",
  Rejected: "Arhivirano",
};

const stageVariant: Record<Stage, "default" | "secondary" | "success" | "destructive" | "outline"> = {
  Applied: "default",
  Screening: "secondary",
  Interview: "outline",
  Offer: "secondary",
  Accepted: "success",
  Rejected: "destructive",
};

function daysSince(value?: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase() || "?";
}

export function ApplicantWorkTable({
  applicants,
  returnTo,
  onDelete,
  onMarkNewReviewed,
  selectedIds,
  onToggleSelection,
  onToggleAll,
}: ApplicantWorkTableProps) {
  const { stageLabel, tt } = useI18n();
  const navigate = useNavigate();
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const allSelected = applicants.length > 0 && applicants.every((applicant) => selectedIds.has(applicant.id));
  const someSelected = applicants.some((applicant) => selectedIds.has(applicant.id));
  const columns = "grid-cols-[2.5rem_minmax(14rem,1.35fr)_5rem_minmax(11rem,1.05fr)_7.5rem_minmax(10rem,0.9fr)_6.5rem_4.5rem]";

  const copyValue = async (candidateId: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCandidateId(candidateId);
      window.setTimeout(() => setCopiedCandidateId(null), 1600);
    } catch {
      setCopiedCandidateId(null);
    }
  };

  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-card lg:block">
      <div className={`grid ${columns} items-center border-b border-border bg-muted/35 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
          aria-label={tt("Izberi vse prikazane kandidate")}
        />
        <span>{tt("Kandidat")}</span>
        <span>{tt("Ocena")}</span>
        <span>{tt("Delovno mesto")}</span>
        <span>{tt("Faza")}</span>
        <span>{tt("Naslednji korak")}</span>
        <span>{tt("Aktivnost")}</span>
        <span className="text-right">{tt("Akcije")}</span>
      </div>

      <div className="divide-y divide-border">
        {applicants.map((applicant) => {
          const candidatePath = `/applicants/${applicant.id}?returnTo=${encodeURIComponent(returnTo)}`;
          const age = daysSince(applicant.createdAt);
          const isOpen = applicant.stage !== "Accepted" && applicant.stage !== "Rejected";

          return (
            <div
              key={applicant.id}
              role="link"
              tabIndex={0}
              aria-selected={selectedIds.has(applicant.id)}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button,a,input,[data-slot^='dropdown-menu']")) return;
                navigate(candidatePath, { state: { returnTo } });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target === event.currentTarget) {
                  navigate(candidatePath, { state: { returnTo } });
                }
              }}
              className={`group grid ${columns} cursor-pointer items-center px-4 py-3 text-sm transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedIds.has(applicant.id) ? "bg-primary/5" : ""}`}
            >
              <Checkbox
                checked={selectedIds.has(applicant.id)}
                onCheckedChange={(checked) => onToggleSelection(applicant.id, checked === true)}
                aria-label={`${tt("Izberi")} ${applicant.name}`}
              />
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials(applicant.name)}
                </span>
                <span className="min-w-0">
                  <Link
                    to={candidatePath}
                    state={{ returnTo }}
                    className="block truncate font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {applicant.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {applicant.location || applicant.email || tt("Lokacija ni navedena")}
                  </span>
                </span>
              </div>

              <ScoreChip
                score={applicant.analysisStatus === "complete" ? applicant.aiScore : null}
                emptyLabel="—"
              />

              <span className="truncate text-muted-foreground" title={applicant.role}>
                {applicant.role}
              </span>

              <Badge variant={stageVariant[applicant.stage]} className="w-fit">
                {stageLabel(applicant.stage)}
              </Badge>

              <Link to={candidatePath} state={{ returnTo }} className="inline-flex min-w-0 items-center gap-2 text-foreground hover:text-primary">
                {applicant.stage === "Accepted" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{tt(nextActionByStage[applicant.stage])}</span>
              </Link>

              <span className={age != null && age > 7 && isOpen ? "text-amber-700" : "text-muted-foreground"}>
                {age == null ? "—" : age === 0 ? tt("Danes") : `${age} ${tt("dni")}`}
              </span>

              <div className="flex justify-end gap-1">
                {applicant.stage === "Applied" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onMarkNewReviewed(applicant.id)}
                    aria-label={tt("Označi kot pregledano")}
                    title={tt("Označi kot pregledano")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => event.stopPropagation()} aria-label={tt("Akcije kandidata")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => navigate(candidatePath, { state: { returnTo } })}><ExternalLink />{tt("Odpri kandidata")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void copyValue(applicant.id, applicant.id)}><Copy />{copiedCandidateId === applicant.id ? tt("ID kopiran") : tt("Kopiraj ID")}<span className="ml-auto font-mono text-[10px] text-muted-foreground">{getShortCandidateId(applicant.id)}</span></DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void copyValue(applicant.id, `${window.location.origin}${candidatePath}`)}><LinkIcon />{tt("Kopiraj povezavo")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(applicant.id)}><Trash2 />{tt("Izbriši kandidata")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
