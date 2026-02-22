import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const navigate = useNavigate();
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
      setErrorMessage("Email and password are required.");
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
      setErrorMessage("Unable to create account. Try again.");
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
    <div className="min-h-screen w-full bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-md border-slate-200 shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl text-slate-900">
                {authMode === "signin" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <img
                src="/images/logo.png"
                alt="TalentAI"
                className="h-25 w-25 rounded-lg object-contain"
              />
            </div>
            <p className="text-sm text-slate-600">
              {authMode === "signin"
                ? "Log in with Google or your email and password."
                : "Create an account with Google or your email and password."}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  authMode === "signin"
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  authMode === "signup"
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Create account
              </button>
            </div>

            <Button
              className="w-full bg-white text-slate-900 hover:bg-slate-50 border border-slate-200"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? "Redirecting..." : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {authMode === "signin" ? "Log in with email" : "Create account"}
              </Button>
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="text-center text-xs text-slate-500">
              By continuing, you agree to our
              <Link className="mx-1 text-slate-700 underline" to="/terms">
                Terms
              </Link>
              and
              <Link className="mx-1 text-slate-700 underline" to="/privacy">
                Privacy Policy
              </Link>
              .
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
