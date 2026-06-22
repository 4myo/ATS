import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Sidebar, type WorkspaceRole } from "../components/Sidebar";
import { CandidateImportProgressBar } from "../components/CandidateImportProgressBar";
import { Briefcase, LogOut, Search, Moon, Sun, Users, UserCog } from "lucide-react";
import { Link } from "react-router";
import { clsx } from "clsx";
import { supabase } from "../lib/supabase";
import { clearCandidateListCache } from "../lib/candidateListCache";
import { clearDashboardCache } from "../lib/dashboardCache";
import { clearJobCache, prefetchJobList } from "../lib/jobCache";
import { useI18n } from "../lib/i18n";
import { getLocationPath, recordAppNavigationPath } from "../lib/appNavigationHistory";

type UserProfile = {
  name: string;
  avatarUrl?: string | null;
};

type SearchResult = {
  id: string;
  label: string;
  meta: string | null;
  type: "candidate" | "job";
  path: string;
};

const sidebarStorageKey = "smart-ats-sidebar-collapsed";
const workspaceRoleStorageKey = "smart-ats-workspace-role";
const sessionCheckTimeoutMs = 10_000;

const normalizeSearchForIlike = (value: string) =>
  value
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\%_]/g, "\\$&");

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCompactSidebar, setIsCompactSidebar] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>("recruiter");
  const { language, setLanguage, t } = useI18n();

  useEffect(() => {
    const savedRole = window.localStorage.getItem(workspaceRoleStorageKey);
    if (savedRole === "recruiter" || savedRole === "hiring_manager" || savedRole === "interviewer") {
      setWorkspaceRole(savedRole);
    }
  }, []);

  useEffect(() => {
    recordAppNavigationPath(getLocationPath(location));
  }, [location]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");

    const syncSidebarMode = () => {
      const compact = mediaQuery.matches;
      setIsCompactSidebar(compact);
      setIsSidebarCollapsed(
        compact
          ? true
          : window.localStorage.getItem(sidebarStorageKey) === "true",
      );
    };

    syncSidebarMode();
    mediaQuery.addEventListener("change", syncSidebarMode);
    return () => mediaQuery.removeEventListener("change", syncSidebarMode);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applySession = (
      session: NonNullable<
        Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
      >,
    ) => {
      const metadata = session.user.user_metadata ?? {};
      const name =
        metadata.full_name ||
        metadata.name ||
        session.user.email ||
        "Account";
      const avatarUrl = metadata.avatar_url || metadata.picture || null;

      setProfile({ name, avatarUrl });
      setCheckingSession(false);
      void prefetchJobList();
    };

    const redirectToAuth = () => {
      clearCandidateListCache();
      clearDashboardCache();
      clearJobCache();
      setProfile(null);
      setCheckingSession(false);
      navigate("/auth", { replace: true });
    };

    const verifySession = async () => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("Session check timed out")),
              sessionCheckTimeoutMs,
            );
          }),
        ]);

        if (!isMounted) return;

        if (sessionResult.error) {
          throw sessionResult.error;
        }

        if (!sessionResult.data.session) {
          redirectToAuth();
          return;
        }

        applySession(sessionResult.data.session);
      } catch (error) {
        console.error("[auth] Session verification failed", error);
        if (isMounted) redirectToAuth();
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    void verifySession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;

        if (!session) {
          redirectToAuth();
          return;
        }

        applySession(session);
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("smart-ats-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : prefersDark;

    document.documentElement.classList.toggle("dark", shouldUseDark);
    setIsDarkMode(shouldUseDark);
  }, []);

  const toggleTheme = () => {
    const nextMode = !isDarkMode;
    document.documentElement.classList.toggle("dark", nextMode);
    window.localStorage.setItem("smart-ats-theme", nextMode ? "dark" : "light");
    setIsDarkMode(nextMode);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      if (!isCompactSidebar) {
        window.localStorage.setItem(sidebarStorageKey, String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;
    const normalizedQuery = searchQuery.trim();

    if (!isSearchOpen) {
      setIsSearching(false);
      return () => {
        isMounted = false;
      };
    }

    setIsSearching(true);
    const timeoutId = window.setTimeout(async () => {
      let candidateQuery = supabase
          .from("candidates")
          .select("id, full_name, job_title, stage")
          .order("created_at", { ascending: false })
          .limit(6);

      let jobQuery = supabase
          .from("jobs")
          .select("id, title, type")
          .order("created_at", { ascending: false })
          .limit(4);

      if (normalizedQuery.length >= 2) {
        const escapedQuery = normalizeSearchForIlike(normalizedQuery);
        if (!escapedQuery) {
          setSearchResults([]);
          setIsSearching(false);
          return;
        }
        const searchPattern = `%${escapedQuery}%`;

        candidateQuery = candidateQuery.or(
          `full_name.ilike.${searchPattern},job_title.ilike.${searchPattern},email.ilike.${searchPattern}`,
        );
        jobQuery = jobQuery.or(`title.ilike.${searchPattern},type.ilike.${searchPattern}`);
      }

      const [{ data: candidateRows }, { data: jobRows }] = await Promise.all([
        candidateQuery,
        jobQuery,
      ]);

      if (!isMounted) return;

      const candidates = (candidateRows ?? []).map((row) => ({
        id: row.id,
        label: row.full_name,
        meta: row.job_title,
        type: "candidate" as const,
        path: `/applicants/${row.id}`,
      }));

      const jobs = (jobRows ?? []).map((row) => ({
        id: row.id,
        label: row.title,
        meta: row.type,
        type: "job" as const,
        path: `/jobs/${row.id}`,
      }));

      setSearchResults([...candidates, ...jobs]);
      setIsSearching(false);
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, isSearchOpen]);

  const navigateToResult = (result: SearchResult) => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchOpen(false);
    const returnTo = `${location.pathname}${location.search}`;
    navigate(
      result.type === "candidate"
        ? `${result.path}?returnTo=${encodeURIComponent(returnTo)}`
        : result.path,
      result.type === "candidate" ? { state: { returnTo } } : undefined,
    );
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searchResults[0]) {
      navigateToResult(searchResults[0]);
      return;
    }

    if (searchQuery.trim()) {
      navigate(`/applicants?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("checkingSession")}
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      <CandidateImportProgressBar />
      {isCompactSidebar && !isSidebarCollapsed ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={toggleSidebar}
          aria-label="Zapri meni"
        />
      ) : null}
      <div
        className={clsx(
          "relative z-40 flex-none transition-[width] duration-300 ease-in-out",
          isCompactSidebar
            ? "w-[4.5rem]"
            : isSidebarCollapsed
              ? "w-[4.5rem]"
              : "w-60",
        )}
      >
        <div
          className={clsx(
            "h-screen transition-[width] duration-300 ease-in-out",
            isCompactSidebar && "fixed inset-y-0 left-0",
            isSidebarCollapsed ? "w-[4.5rem]" : "w-60",
          )}
        >
          <Sidebar
            collapsed={isSidebarCollapsed}
            role={workspaceRole}
            onToggle={toggleSidebar}
            onNavigate={() => {
              if (isCompactSidebar) {
                setIsSidebarCollapsed(true);
              }
            }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[width] duration-300 ease-in-out">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-3 py-3 sm:px-5 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <form className="relative min-w-0 flex-1 sm:flex-none" onSubmit={handleSearchSubmit}>
              <div className="flex w-full min-w-[9rem] items-center rounded-md border border-border bg-muted/60 px-3 py-2 transition-all focus-within:bg-card focus-within:ring-2 focus-within:ring-ring sm:w-72 lg:w-96">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsSearchOpen(false), 120);
                  }}
                  placeholder={t("searchPlaceholder")}
                  className="ml-2 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              {isSearchOpen ? (
                <div className="absolute left-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl dark:shadow-none">
                  {isSearching ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      {t("searching")}
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto py-1">
                      {searchQuery.trim().length < 2 ? (
                        <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("recentSearchItems")}
                        </div>
                      ) : null}
                      {searchResults.map((result) => {
                        const Icon = result.type === "candidate" ? Users : Briefcase;
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            type="button"
                            className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-accent"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => navigateToResult(result)}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {result.label}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {result.type === "candidate" ? t("candidate") : t("job")}
                                {result.meta ? ` · ${result.meta}` : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      {t("noSearchResults")}
                    </div>
                  )}
                </div>
              ) : null}
            </form>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
            <label className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
              <UserCog className="h-4 w-4" />
              <span className="sr-only">Workspace role</span>
              <select
                value={workspaceRole}
                onChange={(event) => {
                  const nextRole = event.target.value as WorkspaceRole;
                  setWorkspaceRole(nextRole);
                  window.localStorage.setItem(workspaceRoleStorageKey, nextRole);
                }}
                className="h-9 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                aria-label="Workspace role"
              >
                <option value="recruiter">Recruiter</option>
                <option value="hiring_manager">Hiring manager</option>
                <option value="interviewer">Interviewer</option>
              </select>
            </label>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-accent"
              onClick={toggleTheme}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-accent"
              onClick={() => setLanguage(language === "en" ? "sl" : "en")}
              title={language === "en" ? t("switchToSlovenian") : t("switchToEnglish")}
            >
              {language === "en" ? "SL" : "EN"}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-accent"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("signOut")}</span>
            </button>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <Link to="/settings" className="flex items-center space-x-2">
              {profile?.avatarUrl ? (
                <img
                  className="h-8 w-8 rounded-full border border-border object-cover"
                  src={profile.avatarUrl}
                  alt={profile?.name ?? "User"}
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground">
                  {(profile?.name ?? "A").slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="hidden max-w-[160px] truncate text-sm font-medium text-foreground sm:block">
                {profile?.name ?? "Account"}
              </span>
            </Link>
          </div>
        </header>

        <main className="app-scrollbar flex-1 overflow-auto bg-background">
          <Outlet context={{ workspaceRole }} />
        </main>
      </div>
    </div>
  );
}

export default Layout;
