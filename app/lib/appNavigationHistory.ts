const appNavigationHistoryKey = "smart-ats-navigation-history";

const maxHistoryEntries = 50;

const normalizePath = (path: string) => path || "/";

const readHistory = () => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(appNavigationHistoryKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const writeHistory = (history: string[]) => {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    appNavigationHistoryKey,
    JSON.stringify(history.slice(-maxHistoryEntries)),
  );
};

export const getLocationPath = (location: {
  pathname: string;
  search?: string;
  hash?: string;
}) => `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;

export const recordAppNavigationPath = (path: string) => {
  const nextPath = normalizePath(path);
  if (nextPath.startsWith("/auth")) return;

  const history = readHistory();
  if (history[history.length - 1] === nextPath) return;

  writeHistory([...history, nextPath]);
};

export const getPreviousAppNavigationPath = (
  currentPath: string,
  fallbackPath: string,
) => {
  const current = normalizePath(currentPath);
  const fallback = normalizePath(fallbackPath);
  const history = readHistory();
  const trimmed = [...history];

  while (trimmed.length && trimmed[trimmed.length - 1] === current) {
    trimmed.pop();
  }

  const previous = [...trimmed].reverse().find((path) => path !== current);
  return previous ?? fallback;
};
