import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bot,
  CheckCircle,
  KeyRound,
  LogOut,
  Moon,
  Save,
  Shield,
  Sliders,
  Sun,
  User,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

type AccountSettings = {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  provider: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (userError || !data.user) {
        navigate("/auth", { replace: true });
        return;
      }

      const metadata = data.user.user_metadata ?? {};
      const name =
        metadata.full_name ||
        metadata.name ||
        data.user.email ||
        "";

      const nextAccount = {
        email: data.user.email ?? "Email unavailable",
        displayName: name,
        avatarUrl: metadata.avatar_url || metadata.picture || null,
        provider: data.user.app_metadata?.provider ?? "email",
        createdAt: data.user.created_at ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
      };

      const savedTheme = window.localStorage.getItem("smart-ats-theme");
      const nextTheme = savedTheme === "light" ? "light" : "dark";

      setAccount(nextAccount);
      setDisplayName(nextAccount.displayName);
      setTheme(nextTheme);
      setIsLoading(false);
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const initials = useMemo(() => {
    const source = displayName || account?.email || "A";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [account?.email, displayName]);

  const setStatus = (nextMessage: string | null, nextError: string | null = null) => {
    setMessage(nextMessage);
    setError(nextError);
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      setStatus(null, t("displayNameRequired"));
      return;
    }

    setIsSavingProfile(true);
    setStatus(null);

    const { data, error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: displayName.trim(),
        name: displayName.trim(),
      },
    });

    if (updateError) {
      setStatus(null, updateError.message);
      setIsSavingProfile(false);
      return;
    }

    setAccount((current) =>
      current
        ? {
            ...current,
            displayName: displayName.trim(),
            avatarUrl:
              data.user?.user_metadata?.avatar_url ||
              data.user?.user_metadata?.picture ||
              current.avatarUrl,
          }
        : current,
    );
      setStatus(t("profileUpdated"));
    setIsSavingProfile(false);
  };

  const handleThemeChange = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    window.localStorage.setItem("smart-ats-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setStatus(t("themeSaved"));
  };

  const handlePasswordReset = async () => {
    if (!account?.email) return;

    setStatus(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      account.email,
      {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    );

    if (resetError) {
      setStatus(null, resetError.message);
      return;
    }

    setStatus(`${t("passwordResetSent")} ${account.email}.`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : t("unavailable");

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="surface-card p-6 text-sm text-muted-foreground">
          {t("loadingSettings")}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">{t("settings")}</h1>
          <p className="text-sm subtle-text">
            {t("settingsSubtitle")}
          </p>
        </div>
        {(message || error) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              error
                ? "border-red-500/30 bg-red-500/10 text-red-500"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {error || message}
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="surface-card p-6">
          <div className="flex items-start gap-4">
            {account?.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt={account.displayName}
                className="h-14 w-14 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted text-base font-semibold text-foreground">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">{t("accountProfile")}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("accountProfileSubtitle")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t("displayName")}</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input value={account?.email ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>{t("authProvider")}</Label>
              <Input value={account?.provider ?? "email"} readOnly />
            </div>
            <div className="space-y-2">
              <Label>{t("lastSignIn")}</Label>
              <Input value={formatDate(account?.lastSignInAt ?? null)} readOnly />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              <Save className="h-4 w-4" />
              {isSavingProfile ? t("saving") : t("saveProfile")}
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </Button>
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2 text-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("security")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("securitySubtitle")}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-md border border-border bg-muted/35 p-4">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {t("activeSession")}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t("accountCreated")} {formatDate(account?.createdAt ?? null)}.
              </p>
            </div>
            <Button variant="outline" onClick={handlePasswordReset}>
              <KeyRound className="h-4 w-4" />
              {t("sendPasswordReset")}
            </Button>
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2 text-foreground">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("workspace")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("workspaceSubtitle")}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={`rounded-md border p-4 text-left transition hover:bg-muted ${
                theme === "light" ? "border-ring bg-muted" : "border-border"
              }`}
            >
              <Sun className="h-5 w-5 text-foreground" />
              <div className="mt-3 font-medium text-foreground">{t("lightMode")}</div>
              <div className="text-sm text-muted-foreground">{t("lightModeDescription")}</div>
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={`rounded-md border p-4 text-left transition hover:bg-muted ${
                theme === "dark" ? "border-ring bg-muted" : "border-border"
              }`}
            >
              <Moon className="h-5 w-5 text-foreground" />
              <div className="mt-3 font-medium text-foreground">{t("darkMode")}</div>
              <div className="text-sm text-muted-foreground">{t("darkModeDescription")}</div>
            </button>
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2 text-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("aiReview")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("aiReviewSubtitle")}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm">
            {[
              t("atsMatchScore"),
              t("strengthsAndConcerns"),
              t("skillProfileRadar"),
              t("cvAiWritingSignal"),
            ].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-md border border-border bg-muted/35 px-3 py-2"
              >
                <span className="text-muted-foreground">{item}</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500">
                  {t("enabled")}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
