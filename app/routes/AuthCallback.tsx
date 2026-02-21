import { useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const finalizeSession = async () => {
      const { error } = await supabase.auth.getSession();

      if (isMounted) {
        if (error) {
          navigate("/auth", { replace: true });
          return;
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Finalizing sign-in...
    </div>
  );
}
