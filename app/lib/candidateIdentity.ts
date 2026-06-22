const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export const getCandidateIdSearchValue = (query: string) => {
  const normalized = normalize(query);
  return normalized.startsWith("id:") ? normalized.slice(3).trim() : normalized;
};

export const matchesCandidateSearch = ({
  candidateId,
  query,
  values = [],
}: {
  candidateId?: string | null;
  query: string;
  values?: unknown[];
}) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  const idQuery = getCandidateIdSearchValue(query);
  const normalizedId = normalize(candidateId);
  if (normalizedQuery.startsWith("id:")) {
    return Boolean(idQuery && normalizedId.includes(idQuery));
  }

  return normalizedId.includes(idQuery) || values.some((value) => normalize(value).includes(normalizedQuery));
};

export const getShortCandidateId = (candidateId: string) => candidateId.slice(0, 8);
