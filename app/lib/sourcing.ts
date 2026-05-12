export type SourcingSource =
  | "linkedin"
  | "x"
  | "github"
  | "portfolio"
  | "csv"
  | "referral"
  | "manual";

export type SourcingStatus =
  | "new"
  | "reviewed"
  | "contacted";

export type SourcingDocument = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type SourcingLead = {
  id: string;
  name: string;
  headline: string;
  source: SourcingSource;
  profileUrl: string;
  location: string;
  skills: string[];
  notes: string;
  evidence: string;
  documents: SourcingDocument[];
  status: SourcingStatus;
  email?: string;
  phone?: string;
  candidateId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GithubSourcingResult = {
  id: number;
  login: string;
  html_url: string;
  avatar_url: string;
  score: number;
  type: string;
};

export type SourcingSearchState = {
  githubQuery: string;
  githubSkill: string;
  githubLocation: string;
  githubResults: GithubSourcingResult[];
  githubRateInfo: {
    remaining: string | null;
    reset: string | null;
  } | null;
  hasSearchedGithub: boolean;
  githubQueryUsed: string;
  savedAt: string;
};

export type SourcingLeadInput = Omit<
  SourcingLead,
  "id" | "createdAt" | "updatedAt"
>;

const storageKey = "smart-ats-sourcing-leads";
const searchStorageKey = "smart-ats-sourcing-search";

const sources: SourcingSource[] = [
  "linkedin",
  "x",
  "github",
  "portfolio",
  "csv",
  "referral",
  "manual",
];

const statuses: SourcingStatus[] = [
  "new",
  "reviewed",
  "contacted",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeSource = (value: unknown): SourcingSource =>
  sources.includes(value as SourcingSource) ? (value as SourcingSource) : "manual";

const normalizeStatus = (value: unknown): SourcingStatus =>
  statuses.includes(value as SourcingStatus) ? (value as SourcingStatus) : "new";

const normalizeDocument = (value: unknown): SourcingDocument | null => {
  if (!isRecord(value)) return null;

  const content = String(value.content ?? "").trim();
  if (!content) return null;

  const now = new Date().toISOString();
  return {
    id: String(value.id ?? crypto.randomUUID()),
    title: String(value.title ?? "").trim() || "Dokument",
    content,
    createdAt: String(value.createdAt ?? now),
  };
};

const normalizeLead = (value: unknown): SourcingLead | null => {
  if (!isRecord(value)) return null;

  const id = String(value.id ?? "");
  const name = String(value.name ?? "").trim();
  const profileUrl = String(value.profileUrl ?? "").trim();

  if (!id || (!name && !profileUrl)) return null;

  const now = new Date().toISOString();
  const skills = Array.isArray(value.skills)
    ? value.skills.map((skill) => String(skill).trim()).filter(Boolean)
    : [];
  const documents = Array.isArray(value.documents)
    ? (value.documents.map(normalizeDocument).filter(Boolean) as SourcingDocument[])
    : [];

  return {
    id,
    name: name || "Neimenovan talent",
    headline: String(value.headline ?? "").trim(),
    source: normalizeSource(value.source),
    profileUrl,
    location: String(value.location ?? "").trim(),
    skills,
    notes: String(value.notes ?? "").trim(),
    evidence: String(value.evidence ?? "").trim(),
    documents,
    status: normalizeStatus(value.status),
    email: String(value.email ?? "").trim() || undefined,
    phone: String(value.phone ?? "").trim() || undefined,
    candidateId: String(value.candidateId ?? "").trim() || undefined,
    convertedAt: String(value.convertedAt ?? "").trim() || undefined,
    createdAt: String(value.createdAt ?? now),
    updatedAt: String(value.updatedAt ?? now),
  };
};

export const getSourcingLeads = () => {
  if (typeof window === "undefined") return [] as SourcingLead[];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLead).filter(Boolean) as SourcingLead[];
  } catch (_error) {
    return [];
  }
};

export const setSourcingLeads = (leads: SourcingLead[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(leads));
};

export const addSourcingLead = (input: SourcingLeadInput) => {
  const now = new Date().toISOString();
  const lead: SourcingLead = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const nextLeads = [lead, ...getSourcingLeads()];
  setSourcingLeads(nextLeads);
  return nextLeads;
};

export const updateSourcingLead = (
  id: string,
  updates: Partial<Omit<SourcingLead, "id" | "createdAt">>,
) => {
  const nextLeads = getSourcingLeads().map((lead) =>
    lead.id === id
      ? {
          ...lead,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      : lead,
  );
  setSourcingLeads(nextLeads);
  return nextLeads;
};

export const deleteSourcingLead = (id: string) => {
  const nextLeads = getSourcingLeads().filter((lead) => lead.id !== id);
  setSourcingLeads(nextLeads);
  return nextLeads;
};

const normalizeGithubResult = (value: unknown): GithubSourcingResult | null => {
  if (!isRecord(value)) return null;

  const id = Number(value.id);
  const login = String(value.login ?? "").trim();
  const htmlUrl = String(value.html_url ?? "").trim();
  const avatarUrl = String(value.avatar_url ?? "").trim();

  if (!Number.isFinite(id) || !login || !htmlUrl) return null;

  return {
    id,
    login,
    html_url: htmlUrl,
    avatar_url: avatarUrl,
    score: Number(value.score ?? 0),
    type: String(value.type ?? "User"),
  };
};

export const getSourcingSearchState = (): SourcingSearchState | null => {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(searchStorageKey) ?? "null");
    if (!isRecord(parsed)) return null;

    return {
      githubQuery: String(parsed.githubQuery ?? ""),
      githubSkill: String(parsed.githubSkill ?? ""),
      githubLocation: String(parsed.githubLocation ?? ""),
      githubResults: Array.isArray(parsed.githubResults)
        ? (parsed.githubResults.map(normalizeGithubResult).filter(Boolean) as GithubSourcingResult[])
        : [],
      githubRateInfo: isRecord(parsed.githubRateInfo)
        ? {
            remaining:
              parsed.githubRateInfo.remaining === null
                ? null
                : String(parsed.githubRateInfo.remaining ?? ""),
            reset:
              parsed.githubRateInfo.reset === null
                ? null
                : String(parsed.githubRateInfo.reset ?? ""),
          }
        : null,
      hasSearchedGithub: Boolean(parsed.hasSearchedGithub),
      githubQueryUsed: String(parsed.githubQueryUsed ?? ""),
      savedAt: String(parsed.savedAt ?? ""),
    };
  } catch (_error) {
    return null;
  }
};

export const setSourcingSearchState = (
  state: Omit<SourcingSearchState, "savedAt">,
) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    searchStorageKey,
    JSON.stringify({ ...state, savedAt: new Date().toISOString() }),
  );
};
