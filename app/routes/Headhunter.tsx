import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Github,
  Link as LinkIcon,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { updateCachedApplicants } from "../lib/candidateListCache";
import { fetchJobOptions, getCachedJobOptions, type CachedJobOption } from "../lib/jobCache";
import { logActivityEvent } from "../lib/activityLog";
import {
  addSourcingLead,
  deleteSourcingLead,
  getSourcingSearchState,
  getSourcingLeads,
  setSourcingSearchState,
  updateSourcingLead,
  type GithubSourcingResult,
  type SourcingLead,
  type SourcingSource,
  type SourcingStatus,
} from "../lib/sourcing";

type GithubRateInfo = {
  remaining: string | null;
  reset: string | null;
};

type ManualDraft = {
  name: string;
  headline: string;
  source: SourcingSource;
  profileUrl: string;
  location: string;
  skills: string;
  notes: string;
};

const sourceOptions: Array<{ value: SourcingSource; en: string; sl: string }> = [
  { value: "linkedin", en: "LinkedIn link", sl: "LinkedIn povezava" },
  { value: "x", en: "X / Twitter link", sl: "X / Twitter povezava" },
  { value: "github", en: "GitHub", sl: "GitHub" },
  { value: "portfolio", en: "Portfolio", sl: "Portfelj" },
  { value: "csv", en: "CSV import", sl: "CSV uvoz" },
  { value: "referral", en: "Referral", sl: "Priporočilo" },
  { value: "manual", en: "Manual note", sl: "Ročni vnos" },
];

const statusOptions: Array<{ value: SourcingStatus; en: string; sl: string }> = [
  { value: "new", en: "Found", sl: "Najden" },
  { value: "reviewed", en: "Reviewed", sl: "Pregledan" },
  { value: "contacted", en: "Contacted", sl: "Kontaktiran" },
];

type GithubTypeLabels = {
  githubOrganization: string;
  githubProfile: string;
};

type SourcingSummaryLabels = {
  sourceSummary: string;
  profileSummary: string;
  evidenceSummary: string;
  emailSummary: string;
  phoneSummary: string;
  recruiterNoteSummary: string;
};

const copy = {
  en: {
    title: "Headhunter",
    subtitle:
      "Sourcing workspace for manual leads, GitHub public search, CSV imports, and candidate conversion.",
    manualTitle: "Add lead manually",
    manualSubtitle:
      "Use this for LinkedIn, X, portfolios, referrals, and anything found outside official APIs.",
    name: "Name",
    namePlaceholder: "e.g. Ana Novak",
    headline: "Role / headline",
    headlinePlaceholder: "e.g. BIM architect, frontend developer",
    source: "Source",
    profileUrl: "Profile URL",
    location: "Location",
    skills: "Skills",
    skillsPlaceholder: "Revit, BIM, TypeScript...",
    notes: "Recruiter note",
    addLead: "Add lead",
    githubTitle: "Free GitHub search",
    githubSubtitle:
      "This is not Google search. It searches GitHub user profiles through the public GitHub API and imports selected profiles as leads.",
    githubQuery: "Name / username",
    githubQueryPlaceholder: "Optional, e.g. ana or novak",
    githubSkill: "Language",
    githubLocation: "Location",
    githubLocationPlaceholder: "Slovenia",
    searchGithub: "Search GitHub",
    openGithubSearch: "Open on GitHub",
    githubEmpty: "No GitHub results yet.",
    githubNoResults:
      "No profiles found. Try leaving name empty, use language:typescript, or broaden the location to Slovenia.",
    githubQueryUsed: "Query used",
    importLead: "Import lead",
    createCandidate: "Create candidate",
    candidateCreated: "Candidate created.",
    candidateCreateFailed: "Candidate could not be created.",
    candidateAlreadyCreated: "Candidate already created",
    candidateJob: "Candidate job",
    candidateJobFallback: "Use lead headline",
    signedInRequired: "You must be signed in to create a candidate.",
    contactExtracted: "Contact extracted",
    contactMissing: "No contact detected",
    csvTitle: "CSV import",
    csvSubtitle:
      "Supported headers: name, headline, url, source, location, skills, notes.",
    importCsv: "Import CSV",
    exportCsv: "Export CSV",
    leadsTitle: "Sourcing leads",
    allSources: "All sources",
    allStatuses: "All statuses",
    searchLeads: "Search leads...",
    noLeads: "No leads yet.",
    duplicate: "This profile URL is already saved.",
    added: "Lead saved.",
    csvImported: "CSV imported.",
    githubError: "GitHub search failed.",
    githubRemaining: "GitHub remaining",
    githubReset: "reset",
    githubScore: "score",
    githubOrganization: "GitHub organization",
    githubProfile: "GitHub profile",
    locationPlaceholder: "Ljubljana, Slovenia",
    defaultLeadName: "Unnamed lead",
    fallbackJobTitle: "Sourcing lead",
    manualLinkedInEvidence: "Manually added LinkedIn URL.",
    manualEvidence: "Manually added sourcing lead.",
    githubEvidencePrefix: "GitHub public search",
    csvEvidence: "CSV import.",
    sourceSummary: "Sourcing lead from source",
    profileSummary: "Profile",
    evidenceSummary: "Evidence/search",
    emailSummary: "Email",
    phoneSummary: "Phone",
    recruiterNoteSummary: "Recruiter note",
    candidateStrength: "Candidate was added from sourcing source",
    candidateConcern: "Candidate has no uploaded CV yet; manual review is required before a decision.",
    locationPending: "Location pending",
    ok: "OK",
    total: "Total leads",
    reviewed: "Reviewed",
    contacted: "Contacted",
    ready: "Candidates",
  },
  sl: {
    title: "Lov na talente",
    subtitle:
      "Delovni prostor za ročno dodane talente, GitHub javno iskanje, CSV uvoz in pretvorbo v kandidate.",
    manualTitle: "Ročno dodaj talent",
    manualSubtitle:
      "Uporabi za LinkedIn, X, portfolije, priporočila in vse vire zunaj uradnih API-jev.",
    name: "Ime",
    namePlaceholder: "npr. Ana Novak",
    headline: "Naziv / profil",
    headlinePlaceholder: "npr. BIM arhitekt, frontend razvijalec",
    source: "Vir",
    profileUrl: "URL profila",
    location: "Lokacija",
    skills: "Veščine",
    skillsPlaceholder: "Revit, BIM, TypeScript...",
    notes: "Opomba rekruterja",
    addLead: "Dodaj talent",
    githubTitle: "Brezplačno GitHub iskanje",
    githubSubtitle:
      "To ni Google iskanje. Išče GitHub uporabniške profile prek javnega GitHub API-ja in izbrane profile uvozi kot talente.",
    githubQuery: "Ime / uporabniško ime",
    githubQueryPlaceholder: "Opcijsko, npr. ana ali novak",
    githubSkill: "Jezik",
    githubLocation: "Lokacija",
    githubLocationPlaceholder: "Slovenija",
    searchGithub: "Išči GitHub",
    openGithubSearch: "Odpri na GitHubu",
    githubEmpty: "GitHub rezultatov še ni.",
    githubNoResults:
      "Ni najdenih profilov. Poskusi pustiti ime prazno, uporabi language:typescript ali razširi lokacijo na Slovenijo.",
    githubQueryUsed: "Uporabljen iskalni niz",
    importLead: "Uvozi talent",
    createCandidate: "Ustvari kandidata",
    candidateCreated: "Kandidat je ustvarjen.",
    candidateCreateFailed: "Kandidata ni bilo mogoče ustvariti.",
    candidateAlreadyCreated: "Kandidat je že ustvarjen",
    candidateJob: "Delovno mesto kandidata",
    candidateJobFallback: "Uporabi naziv talenta",
    signedInRequired: "Za ustvarjanje kandidata moraš biti prijavljen.",
    contactExtracted: "Kontakt izluščen",
    contactMissing: "Kontakt ni zaznan",
    csvTitle: "CSV uvoz",
    csvSubtitle:
      "Podprti stolpci: name, headline, url, source, location, skills, notes.",
    importCsv: "Uvozi CSV",
    exportCsv: "Izvozi CSV",
    leadsTitle: "Najdeni talenti",
    allSources: "Vsi viri",
    allStatuses: "Vsi statusi",
    searchLeads: "Išči talente...",
    noLeads: "Ni še najdenih talentov.",
    duplicate: "Ta URL profila je že shranjen.",
    added: "Talent je shranjen.",
    csvImported: "CSV je uvožen.",
    githubError: "GitHub iskanje ni uspelo.",
    githubRemaining: "Preostanek GitHub zahtevkov",
    githubReset: "ponastavitev",
    githubScore: "ocena",
    githubOrganization: "GitHub organizacija",
    githubProfile: "GitHub profil",
    locationPlaceholder: "Ljubljana, Slovenija",
    defaultLeadName: "Neimenovan talent",
    fallbackJobTitle: "Najden talent",
    manualLinkedInEvidence: "Ročno dodan LinkedIn URL.",
    manualEvidence: "Ročno dodan talent.",
    githubEvidencePrefix: "GitHub javno iskanje",
    csvEvidence: "CSV uvoz.",
    sourceSummary: "Talent iz vira",
    profileSummary: "Profil",
    evidenceSummary: "Vir/iskanje",
    emailSummary: "E-pošta",
    phoneSummary: "Telefon",
    recruiterNoteSummary: "Opomba rekruterja",
    candidateStrength: "Kandidat je bil dodan prek vira za iskanje talentov",
    candidateConcern: "Kandidat še nima naloženega CV-ja; pred odločitvijo je potreben ročni pregled.",
    locationPending: "Lokacija ni znana",
    ok: "V redu",
    total: "Vsi talenti",
    reviewed: "Pregledani",
    contacted: "Kontaktirani",
    ready: "Kandidati",
  },
} as const;

const emptyDraft: ManualDraft = {
  name: "",
  headline: "",
  source: "linkedin",
  profileUrl: "",
  location: "",
  skills: "",
  notes: "",
};

const labelForSource = (source: SourcingSource, language: "en" | "sl") =>
  sourceOptions.find((option) => option.value === source)?.[language] ?? source;

const labelForStatus = (status: SourcingStatus, language: "en" | "sl") =>
  statusOptions.find((option) => option.value === status)?.[language] ?? status;

const labelForGithubType = (
  type: string,
  labels: GithubTypeLabels,
) => (type === "Organization" ? labels.githubOrganization : labels.githubProfile);

const normalizeUrl = (value: string) =>
  value.trim().replace(/\/+$/, "").toLowerCase();

const inferNameFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    const segment = url.pathname.split("/").filter(Boolean).pop();
    return segment?.replace(/[-_]+/g, " ").trim() || url.hostname;
  } catch (_error) {
    return value.trim();
  }
};

const parseSkills = (value: string) =>
  value
    .split(/[,\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 12);

const normalizeSourceValue = (value: string): SourcingSource => {
  const normalized = value.trim().toLowerCase();
  const match = sourceOptions.find((option) => option.value === normalized);
  return match?.value ?? "csv";
};

const csvEscape = (value: string) => {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const quoteGithubValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^".*"$/.test(trimmed)) return trimmed;
  return /\s/.test(trimmed) ? `"${trimmed.replace(/"/g, "")}"` : trimmed;
};

const normalizeGithubLanguage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes(":")) return trimmed;
  return `language:${quoteGithubValue(trimmed)}`;
};

const extractContact = (lead: Pick<SourcingLead, "notes" | "profileUrl" | "evidence">) => {
  const source = [lead.notes, lead.profileUrl, lead.evidence].filter(Boolean).join(" ");
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone =
    source.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() ?? "";

  return { email, phone };
};

const buildSourcingSummary = (
  lead: SourcingLead,
  contact: { email: string; phone: string },
  labels: SourcingSummaryLabels,
  language: "en" | "sl",
) =>
  [
    `${labels.sourceSummary}: ${labelForSource(lead.source, language)}.`,
    lead.profileUrl ? `${labels.profileSummary}: ${lead.profileUrl}` : "",
    lead.evidence ? `${labels.evidenceSummary}: ${lead.evidence}` : "",
    contact.email ? `${labels.emailSummary}: ${contact.email}` : "",
    contact.phone ? `${labels.phoneSummary}: ${contact.phone}` : "",
    lead.notes ? `${labels.recruiterNoteSummary}: ${lead.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export default function Headhunter() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const c = copy[language];
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const cachedJobOptions = getCachedJobOptions();
  const [leads, setLeads] = useState<SourcingLead[]>([]);
  const [jobs, setJobs] = useState<CachedJobOption[]>(cachedJobOptions?.jobs ?? []);
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>("__lead_headline__");
  const [draft, setDraft] = useState<ManualDraft>(emptyDraft);
  const [leadSearch, setLeadSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourcingSource | "all">("all");
  const [statusFilter, setStatusFilter] = useState<SourcingStatus | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [githubQuery, setGithubQuery] = useState("");
  const [githubSkill, setGithubSkill] = useState("");
  const [githubLocation, setGithubLocation] = useState("");
  const [githubResults, setGithubResults] = useState<GithubSourcingResult[]>([]);
  const [githubRateInfo, setGithubRateInfo] = useState<GithubRateInfo | null>(null);
  const [isSearchingGithub, setIsSearchingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [hasSearchedGithub, setHasSearchedGithub] = useState(false);
  const [githubQueryUsed, setGithubQueryUsed] = useState("");
  const [creatingCandidateId, setCreatingCandidateId] = useState<string | null>(null);

  useEffect(() => {
    setLeads(getSourcingLeads());
    const savedSearch = getSourcingSearchState();
    if (savedSearch) {
      setGithubQuery(savedSearch.githubQuery);
      setGithubSkill(savedSearch.githubSkill);
      setGithubLocation(savedSearch.githubLocation);
      setGithubResults(savedSearch.githubResults);
      setGithubRateInfo(savedSearch.githubRateInfo);
      setHasSearchedGithub(savedSearch.hasSearchedGithub);
      setGithubQueryUsed(savedSearch.githubQueryUsed);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      try {
        const nextJobs = await fetchJobOptions({ force: !cachedJobOptions });
        if (!isMounted) return;
        setJobs(nextJobs);
        const firstActiveJob = nextJobs.find((job) => (job.status ?? "active") === "active");
        if (firstActiveJob && selectedJobTitle === "__lead_headline__") {
          setSelectedJobTitle(firstActiveJob.title);
        }
      } catch (_error) {
        if (isMounted) setJobs(cachedJobOptions?.jobs ?? []);
      }
    };

    void loadJobs();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSourcingSearchState({
      githubQuery,
      githubSkill,
      githubLocation,
      githubResults,
      githubRateInfo,
      hasSearchedGithub,
      githubQueryUsed,
    });
  }, [
    githubLocation,
    githubQuery,
    githubQueryUsed,
    githubRateInfo,
    githubResults,
    githubSkill,
    hasSearchedGithub,
  ]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      reviewed: leads.filter((lead) => lead.status === "reviewed").length,
      contacted: leads.filter((lead) => lead.status === "contacted").length,
      ready: leads.filter((lead) => Boolean(lead.candidateId)).length,
    }),
    [leads],
  );

  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesSource = sourceFilter === "all" || lead.source === sourceFilter;
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesSearch =
        !query ||
        [
          lead.name,
          lead.headline,
          lead.location,
          lead.profileUrl,
          lead.skills.join(" "),
          lead.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesSource && matchesStatus && matchesSearch;
    });
  }, [leadSearch, leads, sourceFilter, statusFilter]);

  const profileAlreadyExists = (profileUrl: string) => {
    const normalized = normalizeUrl(profileUrl);
    return Boolean(normalized && leads.some((lead) => normalizeUrl(lead.profileUrl) === normalized));
  };

  const saveManualLead = () => {
    const profileUrl = draft.profileUrl.trim();
    const name = draft.name.trim() || inferNameFromUrl(profileUrl);

    if (!name && !profileUrl) return;
    if (profileAlreadyExists(profileUrl)) {
      setMessage(c.duplicate);
      return;
    }
    const contact = extractContact({
      notes: draft.notes,
      profileUrl,
      evidence: "",
    });

    const nextLeads = addSourcingLead({
      name: name || c.defaultLeadName,
      headline: draft.headline.trim(),
      source: draft.source,
      profileUrl,
      location: draft.location.trim(),
      skills: parseSkills(draft.skills),
      notes: draft.notes.trim(),
      email: contact.email || undefined,
      phone: contact.phone || undefined,
      evidence:
        draft.source === "linkedin"
          ? c.manualLinkedInEvidence
          : c.manualEvidence,
      status: "new",
    });

    setLeads(nextLeads);
    setDraft(emptyDraft);
    setMessage(c.added);
  };

  const buildGithubSearchQuery = (options?: { includeName?: boolean }) => {
    const includeName = options?.includeName ?? true;
    const parts = ["type:user"];
    if (includeName && githubQuery.trim()) parts.push(githubQuery.trim());
    if (githubSkill.trim()) parts.push(normalizeGithubLanguage(githubSkill));
    if (githubLocation.trim()) {
      parts.push(`location:${quoteGithubValue(githubLocation)}`);
    }
    return parts.filter(Boolean).join(" ");
  };

  const hasGithubSearchInput = Boolean(
    githubQuery.trim() || githubSkill.trim() || githubLocation.trim(),
  );

  const openGithubSearch = () => {
    if (!hasGithubSearchInput) return;
    const query = buildGithubSearchQuery();
    window.open(
      `https://github.com/search?q=${encodeURIComponent(query)}&type=users`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const fetchGithubUsers = async (query: string) => {
    const response = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=12`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    setGithubRateInfo({
      remaining: response.headers.get("x-ratelimit-remaining"),
      reset: response.headers.get("x-ratelimit-reset"),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(String(payload?.message ?? c.githubError));
    }

    return (payload.items ?? []) as GithubSourcingResult[];
  };

  const searchGithub = async () => {
    const query = buildGithubSearchQuery();
    if (!hasGithubSearchInput || !query) return;

    setIsSearchingGithub(true);
    setGithubError(null);
    setHasSearchedGithub(true);
    setGithubQueryUsed(query);

    try {
      let results = await fetchGithubUsers(query);

      if (results.length === 0 && githubQuery.trim()) {
        const fallbackQuery = buildGithubSearchQuery({ includeName: false });
        if (fallbackQuery !== query) {
          results = await fetchGithubUsers(fallbackQuery);
          setGithubQueryUsed(fallbackQuery);
        }
      }

      setGithubResults(results);
    } catch (error) {
      setGithubResults([]);
      setGithubError(error instanceof Error ? error.message : c.githubError);
    } finally {
      setIsSearchingGithub(false);
    }
  };

  const importGithubLead = (result: GithubSourcingResult) => {
    if (profileAlreadyExists(result.html_url)) {
      setMessage(c.duplicate);
      return;
    }

    const nextLeads = addSourcingLead({
      name: result.login,
      headline: labelForGithubType(result.type, c),
      source: "github",
      profileUrl: result.html_url,
      location: "",
      skills: parseSkills(githubSkill),
      notes: "",
      evidence: `${c.githubEvidencePrefix}: ${githubQueryUsed || buildGithubSearchQuery()}`,
      status: "new",
    });

    setLeads(nextLeads);
    setMessage(c.added);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return;

    const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
    let nextLeads = leads;

    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const row = headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = cells[index] ?? "";
        return acc;
      }, {});
      const profileUrl = row.url || row.profileurl || row.profile_url || "";
      const name = row.name || inferNameFromUrl(profileUrl);

      if (!name && !profileUrl) continue;
      if (profileAlreadyExists(profileUrl)) continue;
      const contact = extractContact({
        notes: row.notes || "",
        profileUrl,
        evidence: "",
      });

      nextLeads = addSourcingLead({
        name: name || c.defaultLeadName,
        headline: row.headline || row.title || "",
        source: normalizeSourceValue(row.source || "csv"),
        profileUrl,
        location: row.location || "",
        skills: parseSkills(row.skills || ""),
        notes: row.notes || "",
        email: row.email || contact.email || undefined,
        phone: row.phone || contact.phone || undefined,
        evidence: c.csvEvidence,
        status: "new",
      });
    }

    setLeads(nextLeads);
    setMessage(c.csvImported);
  };

  const exportCsv = () => {
    const rows = leads.map((lead) => [
      lead.name,
      lead.headline,
      lead.source,
      lead.status,
      lead.profileUrl,
      lead.location,
      lead.skills.join(", "),
      lead.email ?? "",
      lead.phone ?? "",
      lead.notes,
      lead.candidateId ?? "",
      lead.createdAt,
    ]);
    const csv = [
      [
        "name",
        "headline",
        "source",
        "status",
        "url",
        "location",
        "skills",
        "email",
        "phone",
        "notes",
        "candidate_id",
        "created_at",
      ],
      ...rows,
    ]
      .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smart-ats-sourcing-leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLeadStatusChange = (leadId: string, status: SourcingStatus) => {
    setLeads(updateSourcingLead(leadId, { status }));
  };

  const handleDeleteLead = (leadId: string) => {
    setLeads(deleteSourcingLead(leadId));
  };

  const createCandidateFromLead = async (lead: SourcingLead) => {
    if (lead.candidateId) {
      navigate(`/applicants/${lead.candidateId}?returnTo=/headhunter`);
      return;
    }

    setCreatingCandidateId(lead.id);
    setMessage(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(c.signedInRequired);
      }

      const contact = {
        email: lead.email ?? extractContact(lead).email,
        phone: lead.phone ?? extractContact(lead).phone,
      };
      const jobTitle =
        selectedJobTitle === "__lead_headline__"
          ? lead.headline || c.fallbackJobTitle
          : selectedJobTitle;
      const summary = buildSourcingSummary(lead, contact, c, language);
      const createdAt = new Date().toISOString();

      const { data: inserted, error } = await supabase
        .from("candidates")
        .insert({
          user_id: sessionData.session.user.id,
          full_name: lead.name,
          job_title: jobTitle,
          stage: "Applied",
          email: contact.email || null,
          location: lead.location || null,
          years_experience: 0,
          skills: lead.skills,
          ats_score: 0,
          analysis_summary: summary,
          analysis_strengths: [
            `${c.candidateStrength} ${labelForSource(lead.source, language)}.`,
          ],
          analysis_concerns: [
            c.candidateConcern,
          ],
          analysis_status: "complete",
        })
        .select("id")
        .single();

      if (error || !inserted?.id) {
        throw error ?? new Error(c.candidateCreateFailed);
      }

      const nextLeads = updateSourcingLead(lead.id, {
        candidateId: inserted.id,
        convertedAt: createdAt,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
      });
      setLeads(nextLeads);
      updateCachedApplicants((applicants) => [
        {
          id: inserted.id,
          name: lead.name,
          role: jobTitle,
          stage: "Applied",
          analysisStatus: "complete",
          createdAt,
          aiScore: 0,
          skills: lead.skills,
          experience: 0,
          location: lead.location || c.locationPending,
          avatar: "",
          email: contact.email,
          phone: contact.phone,
          summary,
          analysisStrengths: [
            `${c.candidateStrength} ${labelForSource(lead.source, language)}.`,
          ],
          analysisConcerns: [
            c.candidateConcern,
          ],
          matchAnalysis: { pros: [], cons: [] },
        },
        ...applicants,
      ]);
      void logActivityEvent({
        action: "candidate_created",
        entityType: "candidate",
        entityId: inserted.id,
        entityLabel: lead.name,
        toValue: "Applied",
        metadata: {
          source: "headhunter",
          sourcing_lead_id: lead.id,
          profile_url: lead.profileUrl || null,
          job_title: jobTitle,
          email_extracted: Boolean(contact.email),
          phone_extracted: Boolean(contact.phone),
        },
      });
      setMessage(c.candidateCreated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : c.candidateCreateFailed);
    } finally {
      setCreatingCandidateId(null);
    }
  };

  const formattedGithubReset = useMemo(() => {
    if (!githubRateInfo?.reset) return null;
    const resetSeconds = Number(githubRateInfo.reset);
    if (!Number.isFinite(resetSeconds)) return null;
    return new Date(resetSeconds * 1000).toLocaleTimeString("sl-SI", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [githubRateInfo]);

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="page-title">{c.title}</h1>
          <p className="max-w-3xl text-sm subtle-text">{c.subtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[34rem]">
          {[
            { label: c.total, value: stats.total },
            { label: c.reviewed, value: stats.reviewed },
            { label: c.contacted, value: stats.contacted },
            { label: c.ready, value: stats.ready },
          ].map((item) => (
            <div key={item.label} className="surface-card px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <div className="surface-card flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
          <span>{message}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMessage(null)}>
            {c.ok}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.45fr)]">
        <div className="space-y-5">
          <section className="surface-card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                <UserPlus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{c.manualTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.manualSubtitle}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sourcing-name">{c.name}</Label>
                <Input
                  id="sourcing-name"
                  value={draft.name}
                  placeholder={c.namePlaceholder}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourcing-headline">{c.headline}</Label>
                <Input
                  id="sourcing-headline"
                  value={draft.headline}
                  placeholder={c.headlinePlaceholder}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, headline: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{c.source}</Label>
                  <Select
                    value={draft.source}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        source: value as SourcingSource,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option[language]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sourcing-location">{c.location}</Label>
                  <Input
                    id="sourcing-location"
                    value={draft.location}
                    placeholder={c.locationPlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, location: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourcing-url">{c.profileUrl}</Label>
                <Input
                  id="sourcing-url"
                  value={draft.profileUrl}
                  placeholder="https://..."
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, profileUrl: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourcing-skills">{c.skills}</Label>
                <Input
                  id="sourcing-skills"
                  value={draft.skills}
                  placeholder={c.skillsPlaceholder}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, skills: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourcing-notes">{c.notes}</Label>
                <Textarea
                  id="sourcing-notes"
                  value={draft.notes}
                  className="min-h-28"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </div>
              <Button
                type="button"
                className="gap-2"
                disabled={!draft.name.trim() && !draft.profileUrl.trim()}
                onClick={saveManualLead}
              >
                <Plus className="h-4 w-4" />
                {c.addLead}
              </Button>
            </div>
          </section>

          <section className="surface-card p-5">
            <h2 className="text-lg font-semibold text-foreground">{c.csvTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{c.csvSubtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={importCsv}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {c.importCsv}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={leads.length === 0}
                onClick={exportCsv}
              >
                <Download className="h-4 w-4" />
                {c.exportCsv}
              </Button>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="surface-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Github className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{c.githubTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{c.githubSubtitle}</p>
                </div>
              </div>
              {githubRateInfo ? (
                <span className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {c.githubRemaining}: {githubRateInfo.remaining ?? "?"}
                  {formattedGithubReset
                    ? ` · ${c.githubReset} ${formattedGithubReset}`
                    : ""}
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.5fr)_minmax(9rem,0.5fr)_auto_auto]">
              <div className="grid gap-2">
                <Label htmlFor="github-query">{c.githubQuery}</Label>
                <Input
                  id="github-query"
                  value={githubQuery}
                  placeholder={c.githubQueryPlaceholder}
                  onChange={(event) => setGithubQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchGithub();
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="github-skill">{c.githubSkill}</Label>
                <Input
                  id="github-skill"
                  value={githubSkill}
                  placeholder="typescript"
                  onChange={(event) => setGithubSkill(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchGithub();
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="github-location">{c.githubLocation}</Label>
                <Input
                  id="github-location"
                  value={githubLocation}
                  placeholder={c.githubLocationPlaceholder}
                  onChange={(event) => setGithubLocation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchGithub();
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="w-full gap-2"
                  disabled={isSearchingGithub || !hasGithubSearchInput}
                  onClick={() => void searchGithub()}
                >
                  <Search className="h-4 w-4" />
                  {isSearchingGithub ? "..." : c.searchGithub}
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={!hasGithubSearchInput}
                  onClick={openGithubSearch}
                >
                  <ExternalLink className="h-4 w-4" />
                  {c.openGithubSearch}
                </Button>
              </div>
            </div>

            {hasGithubSearchInput ? (
              <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {c.githubQueryUsed}:{" "}
                <span className="font-mono text-foreground">{buildGithubSearchQuery()}</span>
              </div>
            ) : null}

            {githubError ? <p className="mt-3 text-sm text-red-500">{githubError}</p> : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {githubResults.length === 0 && !isSearchingGithub ? (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground md:col-span-2">
                  {hasSearchedGithub ? c.githubNoResults : c.githubEmpty}
                  {githubQueryUsed ? (
                    <span className="mt-2 block text-xs">
                      {c.githubQueryUsed}:{" "}
                      <span className="font-mono text-foreground">{githubQueryUsed}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {githubResults.map((result) => (
                <div key={result.id} className="rounded-md border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <img
                      src={result.avatar_url}
                      alt={result.login}
                      className="h-11 w-11 rounded-md border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{result.login}</p>
                          <p className="text-xs text-muted-foreground">
                            {labelForGithubType(result.type, c)}
                          </p>
                        </div>
                        <a
                          href={result.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={result.html_url}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => importGithubLead(result)}
                        >
                          <Plus className="h-4 w-4" />
                          {c.importLead}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {c.githubScore} {Math.round(result.score)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-lg font-semibold text-foreground">{c.leadsTitle}</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:w-[48rem] xl:grid-cols-4">
                <Input
                  type="search"
                  value={leadSearch}
                  placeholder={c.searchLeads}
                  onChange={(event) => setLeadSearch(event.target.value)}
                />
                <Select
                  value={sourceFilter}
                  onValueChange={(value) => setSourceFilter(value as SourcingSource | "all")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{c.allSources}</SelectItem>
                    {sourceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option[language]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as SourcingStatus | "all")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{c.allStatuses}</SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option[language]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedJobTitle}
                  onValueChange={setSelectedJobTitle}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={c.candidateJob} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__lead_headline__">
                      {c.candidateJobFallback}
                    </SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.title}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredLeads.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {c.noLeads}
                </div>
              ) : null}

              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="grid gap-4 rounded-md border border-border bg-card p-4 xl:grid-cols-[minmax(0,1fr)_13rem_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-foreground">{lead.name}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {labelForSource(lead.source, language)}
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                        {labelForStatus(lead.status, language)}
                      </span>
                      {lead.candidateId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-500">
                          <CheckCircle2 className="h-3 w-3" />
                          {c.candidateAlreadyCreated}
                        </span>
                      ) : null}
                    </div>
                    {lead.headline ? (
                      <p className="mt-1 text-sm text-muted-foreground">{lead.headline}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lead.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                    {lead.location || lead.notes ? (
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {[lead.location, lead.notes].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lead.email || lead.phone ? (
                        <>
                          {c.contactExtracted}: {[lead.email, lead.phone].filter(Boolean).join(" · ")}
                        </>
                      ) : (
                        c.contactMissing
                      )}
                    </p>
                  </div>

                  <div className="grid content-start gap-2">
                    <Select
                      value={lead.status}
                      onValueChange={(value) =>
                        handleLeadStatusChange(lead.id, value as SourcingStatus)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option[language]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{lead.evidence}</p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                    {lead.profileUrl ? (
                      <a
                        href={lead.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={lead.profileUrl}
                      >
                        <LinkIcon className="h-4 w-4" />
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      variant={lead.candidateId ? "outline" : "default"}
                      size="sm"
                      className="gap-2"
                      disabled={creatingCandidateId === lead.id}
                      onClick={() => void createCandidateFromLead(lead)}
                    >
                      {lead.candidateId ? (
                        <ExternalLink className="h-4 w-4" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      {creatingCandidateId === lead.id
                        ? "..."
                        : lead.candidateId
                          ? c.candidateAlreadyCreated
                          : c.createCandidate}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteLead(lead.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
