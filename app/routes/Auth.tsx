import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Clock, FileText, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../lib/supabase";
import { I18nProvider, useI18n } from "../lib/i18n";

type AuthView = "signin" | "signup" | "forgot" | "reset";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxEmailLength = 254;
const minPasswordLength = 10;
const maxPasswordLength = 128;
const termsVersion = "2026-05-07";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

type AuthErrorDetails = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

const isAuthServiceUnavailable = (error: unknown) => {
  const details = (error ?? {}) as AuthErrorDetails;
  const message = typeof details.message === "string" ? details.message : "";
  const status = typeof details.status === "number" ? details.status : 0;

  return (
    status === 0 ||
    status >= 500 ||
    details.name === "AuthRetryableFetchError" ||
    /fetch|network|timeout|failed to connect/i.test(message)
  );
};

const logAuthError = (error: unknown) => {
  const details = (error ?? {}) as AuthErrorDetails;
  console.error("[auth] Sign-in failed", {
    name: details.name,
    status: details.status,
    code: details.code,
    message: details.message,
  });
};

const getPasswordIssues = (password: string) => {
  const issues: string[] = [];
  if (password.length < minPasswordLength) issues.push("najmanj 10 znakov");
  if (password.length > maxPasswordLength) issues.push("največ 128 znakov");
  if (!/[a-z]/.test(password)) issues.push("mala črka");
  if (!/[A-Z]/.test(password)) issues.push("velika črka");
  if (!/\d/.test(password)) issues.push("številka");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("poseben znak");
  return issues;
};

const getPasswordScore = (password: string) =>
  [
    password.length >= minPasswordLength,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

function AuthContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, t } = useI18n();
  const [view, setView] = useState<AuthView>(
    searchParams.get("reset") === "1" ? "reset" : "signin",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const normalizedEmail = normalizeEmail(email);
  const isSignup = view === "signup";
  const isSignin = view === "signin";
  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const passwordScore = useMemo(() => getPasswordScore(password), [password]);
  const showPasswordPolicy = view === "signup" || view === "reset";

  useEffect(() => {
    if (searchParams.get("reset") === "1") {
      setView("reset");
      return;
    }

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
  }, [navigate, searchParams]);

  const resetMessages = () => {
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const switchView = (nextView: AuthView) => {
    setView(nextView);
    setPassword("");
    setConfirmPassword("");
    resetMessages();
  };

  const validateEmail = () => {
    if (
      !normalizedEmail ||
      normalizedEmail.length > maxEmailLength ||
      !emailPattern.test(normalizedEmail)
    ) {
      setErrorMessage(t("validEmailRequired"));
      return false;
    }
    return true;
  };

  const validateStrongPassword = () => {
    if (passwordIssues.length > 0) {
      setErrorMessage(t("passwordPolicyHint"));
      return false;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t("passwordsDoNotMatch"));
      return false;
    }

    return true;
  };

  const handleGoogleSignIn = async () => {
    if (isSignup && !acceptedTerms) {
      setErrorMessage(t("termsRequired"));
      return;
    }

    setIsLoading(true);
    resetMessages();
    if (isSignup) {
      window.localStorage.setItem(
        "smart-ats-oauth-terms",
        JSON.stringify({
          acceptedAt: new Date().toISOString(),
          version: termsVersion,
        }),
      );
    } else {
      window.localStorage.removeItem("smart-ats-oauth-terms");
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setIsLoading(false);
      setErrorMessage(t("authGenericError"));
    }
  };

  const handleEmailAuth = async () => {
    if (!validateEmail()) return;

    if (!password) {
      setErrorMessage(t("emailPasswordRequired"));
      return;
    }

    if (isSignup) {
      if (!acceptedTerms) {
        setErrorMessage(t("termsRequired"));
        return;
      }

      if (!validateStrongPassword()) return;
    }

    setIsLoading(true);
    resetMessages();

    if (isSignin) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!error) {
          navigate("/", { replace: true });
          return;
        }

        logAuthError(error);
        setIsLoading(false);
        setErrorMessage(
          t(
            isAuthServiceUnavailable(error)
              ? "authServiceUnavailable"
              : "authGenericError",
          ),
        );
      } catch (error) {
        logAuthError(error);
        setIsLoading(false);
        setErrorMessage(t("authServiceUnavailable"));
        return;
      }
    }

    const { data: rateLimitData, error: rateLimitError } = await supabase.functions.invoke(
      "signup-with-rate-limit",
      {
        body: {
          email: normalizedEmail,
          password,
          termsAccepted: true,
          termsVersion,
        },
      },
    );

    if (rateLimitError || !rateLimitData?.ok) {
      setIsLoading(false);
      setErrorMessage(t("signupGenericError"));
      return;
    }

    const termsAcceptedAt = new Date().toISOString();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          terms_accepted_at: termsAcceptedAt,
          terms_version: termsVersion,
        },
      },
    });

    if (signUpError || !signUpData.user) {
      setIsLoading(false);
      setErrorMessage(t("signupGenericError"));
      return;
    }

    if (signUpData.session) {
      navigate("/", { replace: true });
      return;
    }

    setIsLoading(false);
    setStatusMessage(t("accountCreatedSignInRequired"));
    setView("signin");
  };

  const handlePasswordResetRequest = async () => {
    if (!validateEmail()) return;

    setIsLoading(true);
    resetMessages();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth?reset=1`,
    });

    setIsLoading(false);
    if (error) {
      setErrorMessage(t("passwordResetGenericError"));
      return;
    }

    setStatusMessage(t("passwordResetGenericSent"));
  };

  const handleUpdatePassword = async () => {
    if (!validateStrongPassword()) return;

    setIsLoading(true);
    resetMessages();
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      setErrorMessage(t("passwordUpdateFailed"));
      return;
    }

    setStatusMessage(t("passwordUpdated"));
    navigate("/", { replace: true });
  };

  const submitLabel =
    view === "signup"
      ? t("createAccount")
      : view === "forgot"
        ? t("sendPasswordReset")
        : view === "reset"
          ? t("setNewPassword")
          : t("loginWithEmail");

  const authTitle =
    view === "signup"
      ? t("createYourAccount")
      : view === "forgot"
        ? t("forgotPasswordTitle")
        : view === "reset"
          ? t("resetPasswordTitle")
          : t("welcomeBack");

  const authSubtitle =
    view === "signup"
      ? t("signUpSubtitle")
      : view === "forgot"
        ? t("forgotPasswordSubtitle")
        : view === "reset"
          ? t("resetPasswordSubtitle")
          : t("signInSubtitle");

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,color-mix(in_oklch,var(--ring)_28%,transparent),transparent_24%),radial-gradient(circle_at_78%_8%,color-mix(in_oklch,var(--foreground)_12%,transparent),transparent_22%),linear-gradient(135deg,var(--background),var(--muted))]" />
        <div className="absolute -left-24 top-24 h-72 w-[46rem] rotate-[-18deg] rounded-full bg-gradient-to-r from-fuchsia-500/25 to-emerald-200/20 blur-3xl dark:from-fuchsia-500/18 dark:to-emerald-200/10" />
        <div className="absolute bottom-0 right-0 h-80 w-[52rem] rotate-[-12deg] rounded-full bg-gradient-to-r from-amber-500/20 to-transparent blur-3xl dark:from-amber-500/10" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      <button
        type="button"
        onClick={() => setLanguage(language === "en" ? "sl" : "en")}
        className="absolute right-6 top-6 z-20 rounded-md border border-border bg-card/90 px-3 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur transition hover:bg-muted"
        title={language === "en" ? t("switchToSlovenian") : t("switchToEnglish")}
      >
        {language === "en" ? "SL" : "EN"}
      </button>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(24rem,0.72fr)]">
        <section className="hidden lg:block">
          <div className="mb-10 flex items-center gap-3">
            <img
              src="/images/logo.png"
              alt="Smart ATS"
              className="h-14 w-14 object-contain"
            />
            <div>
              <div className="logo-font text-xl font-semibold tracking-tight">
                Smart ATS
              </div>
              <div className="text-sm text-muted-foreground">
                {t("secureAtsWorkspace")}
              </div>
            </div>
          </div>
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              {t("authSecurityEyebrow")}
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
              {t("authHeroTitle")}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
              {t("authHeroSubtitle")}
            </p>
          </div>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { label: t("authTrustRateLimit"), Icon: Clock },
              { label: t("authTrustReset"), Icon: Sparkles },
              { label: t("authTrustValidation"), Icon: FileText },
            ].map(({ label, Icon }) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card/75 p-3 text-sm text-muted-foreground shadow-sm backdrop-blur"
              >
                <Icon className="mb-2 h-4 w-4 text-emerald-500" />
                {label}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-md border border-border bg-card/95 p-6 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {authTitle}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{authSubtitle}</p>
            </div>
            <img
              src="/images/logo.png"
              alt="Smart ATS"
              className="h-14 w-14 object-contain"
            />
          </div>

          {view !== "forgot" && view !== "reset" ? (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => switchView("signin")}
                className={`rounded-md px-3 py-2 font-medium transition ${
                  isSignin
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("logIn")}
              </button>
              <button
                type="button"
                onClick={() => switchView("signup")}
                className={`rounded-md px-3 py-2 font-medium transition ${
                  isSignup
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("createAccount")}
              </button>
            </div>
          ) : null}

          {view !== "forgot" && view !== "reset" ? (
            <>
              {isSignup ? (
                <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <Checkbox
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("termsConsentPrefix")}{" "}
                    <Link className="font-medium text-foreground underline" to="/terms">
                      {t("terms")}
                    </Link>{" "}
                    {t("and")}{" "}
                    <Link className="font-medium text-foreground underline" to="/privacy">
                      {t("privacyPolicy")}
                    </Link>
                    .
                  </span>
                </label>
              ) : null}
              <Button
                className="w-full border border-border bg-card text-foreground hover:bg-muted"
                onClick={handleGoogleSignIn}
                disabled={isLoading || (isSignup && !acceptedTerms)}
              >
                {isLoading ? t("redirecting") : t("continueWithGoogle")}
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("or")}
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}

          <div className="space-y-4">
            {view !== "reset" ? (
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={maxEmailLength}
                    placeholder="ime@podjetje.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            ) : null}

            {view !== "forgot" ? (
              <div className="space-y-2">
                <Label htmlFor="password">
                  {view === "reset" ? t("newPassword") : t("password")}
                </Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSignin ? "current-password" : "new-password"}
                    minLength={showPasswordPolicy ? minPasswordLength : undefined}
                    maxLength={maxPasswordLength}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            ) : null}

            {showPasswordPolicy ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    maxLength={maxPasswordLength}
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="mb-2 grid grid-cols-5 gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 rounded-full ${
                          index < passwordScore ? "bg-emerald-500" : "bg-border"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("passwordPolicyHint")}
                  </p>
                </div>
              </>
            ) : null}

            <Button
              className="w-full"
              disabled={isLoading || (isSignup && !acceptedTerms)}
              onClick={
                view === "forgot"
                  ? handlePasswordResetRequest
                  : view === "reset"
                    ? handleUpdatePassword
                    : handleEmailAuth
              }
            >
              {isLoading ? t("working") : submitLabel}
            </Button>
          </div>

          {isSignin ? (
            <button
              type="button"
              onClick={() => switchView("forgot")}
              className="mt-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("forgotPassword")}
            </button>
          ) : null}

          {view === "forgot" || view === "reset" ? (
            <button
              type="button"
              onClick={() => switchView("signin")}
              className="mt-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("backToSignIn")}
            </button>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              {statusMessage}
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            {t("termsPrefix")}{" "}
            <Link className="text-foreground underline" to="/terms">
              {t("terms")}
            </Link>{" "}
            {t("and")}{" "}
            <Link className="text-foreground underline" to="/privacy">
              {t("privacyPolicy")}
            </Link>
            .
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Auth() {
  return (
    <I18nProvider>
      <AuthContent />
    </I18nProvider>
  );
}
