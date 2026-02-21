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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center gap-12 px-6 py-10">
        <div className="hidden w-full max-w-lg flex-col gap-6 lg:flex">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white">
                TA
              </div>
              <span className="text-xl font-semibold">TalentAI</span>
            </div>
            <h1 className="mt-8 text-4xl font-semibold text-slate-900">
              Welcome back
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Sign in to manage applicants, track pipeline health, and keep your
              hiring workflow moving.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4">
              <div className="text-sm font-medium text-slate-700">Why teams choose us</div>
              <div className="grid gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Automated applicant scoring</span>
                  <span className="font-semibold text-slate-900">+28%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Faster hiring decisions</span>
                  <span className="font-semibold text-slate-900">2.3x</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Centralized messaging</span>
                  <span className="font-semibold text-slate-900">All in one</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card className="w-full max-w-md border-slate-200 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-slate-900">Sign in</CardTitle>
            <p className="text-sm text-slate-600">
              Use Google or your work email to access your dashboard.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
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
                <Input id="email" type="email" placeholder="you@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" />
              </div>
              <Button className="w-full" disabled>
                Sign in with email
              </Button>
            </div>

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
