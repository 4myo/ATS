import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { Sidebar } from "../components/Sidebar";
import { LogOut, Menu, Search, Moon, Sun } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { useI18n } from "../lib/i18n";

type UserProfile = {
  name: string;
  avatarUrl?: string | null;
};

export function Layout() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
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

      setCheckingSession(false);
    };

    verifySession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
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

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("checkingSession")}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden flex-none lg:block">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
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
            <div className="flex w-48 items-center rounded-md border border-border bg-muted/60 px-3 py-2 transition-all focus-within:bg-card focus-within:ring-2 focus-within:ring-ring sm:w-72 lg:w-96">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("searchPlaceholder")}
                className="ml-2 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
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
