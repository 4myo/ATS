import { useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";

const termsVersion = "2026-05-07";
const oauthTermsStorageKey = "smart-ats-oauth-terms";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const finalizeSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (isMounted) {
        if (error || !data.session) {
          navigate("/auth", { replace: true });
          return;
        }

        const storedTerms = window.localStorage.getItem(oauthTermsStorageKey);
        if (storedTerms) {
          try {
            const parsedTerms = JSON.parse(storedTerms) as {
              acceptedAt?: unknown;
              version?: unknown;
            };

            if (parsedTerms.version === termsVersion) {
              const acceptedAt =
                typeof parsedTerms.acceptedAt === "string"
                  ? parsedTerms.acceptedAt
                  : new Date().toISOString();

              await supabase.auth.updateUser({
                data: {
                  terms_accepted_at: acceptedAt,
                  terms_version: termsVersion,
                },
              });
            }
          } catch (_error) {
            // Ignore malformed local metadata; the OAuth session itself remains valid.
          } finally {
            window.localStorage.removeItem(oauthTermsStorageKey);
          }
        }

        navigate("/", { replace: true });
      }
    };

    finalizeSession();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Zaključujem prijavo...
    </div>
  );
}
