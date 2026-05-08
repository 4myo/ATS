import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { AiAnalysisQueueBar } from "../components/AiAnalysisQueueBar";
import { CandidateImportProgressBar } from "../components/CandidateImportProgressBar";
import { Briefcase, LogOut, Menu, Search, Moon, Sun, Users } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { clearCandidateListCache } from "../lib/candidateListCache";
import { clearDashboardCache } from "../lib/dashboardCache";
import { clearJobCache, prefetchJobList } from "../lib/jobCache";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { useI18n } from "../lib/i18n";

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

const normalizeSearchForIlike = (value: string) =>
  value
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\%_]/g, "\\$&");

export function Layout() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { language, setLanguage, t } = useI18n();

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!data.session) {
        navigate("/auth", { replace: true });
        return;
      }

      const user = data.session.user;
      const metadata = user.user_metadata ?? {};
      const name =
        metadata.full_name ||
        metadata.name ||
        user.email ||
        "Account";
      const avatarUrl = metadata.avatar_url || metadata.picture || null;

      setProfile({ name, avatarUrl });
      prefetchJobList();

      setCheckingSession(false);
    };

    verifySession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          clearCandidateListCache();
          clearDashboardCache();
          clearJobCache();
          setProfile(null);
          navigate("/auth", { replace: true });
          return;
        }

        const metadata = session.user.user_metadata ?? {};
        const name =
          metadata.full_name ||
          metadata.name ||
          session.user.email ||
          "Account";
        const avatarUrl = metadata.avatar_url || metadata.picture || null;
        setProfile({ name, avatarUrl });
        prefetchJobList();
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
    navigate(result.path);
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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AiAnalysisQueueBar />
      <CandidateImportProgressBar />
      <div className="hidden flex-none lg:block">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-3 py-3 shadow-sm sm:px-6 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-md border border-border bg-card p-2 text-muted-foreground shadow-sm transition hover:bg-muted lg:hidden">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <Sidebar />
              </SheetContent>
            </Sheet>
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
                <div className="absolute left-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-card shadow-xl">
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
                            className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted"
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
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={toggleTheme}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => setLanguage(language === "en" ? "sl" : "en")}
              title={language === "en" ? t("switchToSlovenian") : t("switchToEnglish")}
            >
              {language === "en" ? "SL" : "EN"}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
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

        <main className="flex-1 overflow-auto bg-background p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
