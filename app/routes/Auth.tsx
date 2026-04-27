import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";

export default function Auth() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    let isMounted = true;

    const redirectIfAuthed = async () => {
      const { data } = await supabase.auth.getSession();
      if (isMounted && data.session) {
        navigate("/", { replace: true });
      }
    };

    redirectIfAuthed();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setIsLoading(false);
      setErrorMessage(error.message);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setErrorMessage(t("emailPasswordRequired"));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        setErrorMessage(error.message);
        return;
      }

      navigate("/", { replace: true });
      return;
    }

    const { data, error } = await supabase.functions.invoke(
      "signup-with-rate-limit",
      {
        body: { email, password },
      },
    );

    if (error) {
      setIsLoading(false);
      setErrorMessage(error.message);
      return;
    }

    if (!data?.user) {
      setIsLoading(false);
      setErrorMessage(t("unableCreateAccount"));
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setIsLoading(false);
      setErrorMessage(signInError.message);
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <button
          type="button"
          onClick={() => setLanguage(language === "en" ? "sl" : "en")}
          className="absolute right-6 top-6 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
          title={language === "en" ? t("switchToSlovenian") : t("switchToEnglish")}
        >
          {language === "en" ? "SL" : "EN"}
        </button>
        <Card className="w-full max-w-md border-border bg-card shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl text-foreground">
                {authMode === "signin" ? t("welcomeBack") : t("createYourAccount")}
              </CardTitle>
              <img
                src="/images/logo.png"
                alt="TalentAI"
                className="h-25 w-25 rounded-lg object-contain"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {authMode === "signin"
                ? t("signInSubtitle")
                : t("signUpSubtitle")}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  authMode === "signin"
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("logIn")}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  authMode === "signup"
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("createAccount")}
              </button>
            </div>

            <Button
              className="w-full border border-border bg-card text-foreground hover:bg-muted"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? t("redirecting") : t("continueWithGoogle")}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={isLoading}
                onClick={handleEmailAuth}
              >
                {authMode === "signin" ? t("loginWithEmail") : t("createAccount")}
              </Button>
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="text-center text-xs text-muted-foreground">
              {t("termsPrefix")}
              <Link className="mx-1 text-foreground underline" to="/terms">
                {t("terms")}
              </Link>
              {t("and")}
              <Link className="mx-1 text-foreground underline" to="/privacy">
                {t("privacyPolicy")}
              </Link>
              .
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
