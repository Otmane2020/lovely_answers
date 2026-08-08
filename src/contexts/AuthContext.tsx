"use client";
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string, phone?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const redirectInFlight = useRef(false);

  const getFallbackTarget = (authUser: User) => {
    const createdAt = new Date(authUser.created_at).getTime();
    const isLikelyNewUser = Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000;
    return isLikelyNewUser ? "/wizard" : "/dashboard";
  };

  const redirectAfterAuth = async (authUser: User, source = "auth") => {
    if (typeof window === "undefined") return;

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const searchParams = new URLSearchParams(window.location.search);
    const isRecovery = hashParams.get("type") === "recovery" || searchParams.get("type") === "recovery";
    const intent = searchParams.get("intent") || sessionStorage.getItem("post_oauth_intent");
    const next = searchParams.get("next");

    if (isRecovery || !["/auth", "/signup"].includes(path)) return;
    if (redirectInFlight.current) return;
    redirectInFlight.current = true;

    if (window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
    sessionStorage.removeItem("post_oauth_intent");

    if (next?.startsWith("/")) {
      console.log("[AuthContext] Post-auth next redirect →", next, { source });
      window.location.replace(next);
      return;
    }

    if (intent === "signup") {
      console.log("[AuthContext] OAuth signup redirect → /checkout", { source });
      window.location.replace("/checkout?plan=pro&cycle=annual");
      return;
    }

    try {
      const projectLookup = supabase
        .from("projects")
        .select("id")
        .eq("user_id", authUser.id)
        .limit(1);

      const timeout = new Promise<{ data: null; error: Error }>((resolve) => {
        window.setTimeout(() => resolve({ data: null, error: new Error("project lookup timeout") }), 1500);
      });

      const { data: projects, error } = await Promise.race([projectLookup, timeout]);

      if (error) throw error;

      const target = projects && projects.length > 0 ? "/dashboard" : "/wizard";
      console.log("[AuthContext] Post-auth redirect →", target, { source });
      window.location.replace(target);
    } catch (e) {
      console.error("[AuthContext] Post-auth redirect query error:", e);
      window.location.replace(getFallbackTarget(authUser));
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST.
    // Supabase-js auto-detects OAuth tokens in URL hash (detectSessionInUrl=true by default)
    // and fires SIGNED_IN automatically — we don't need to manually call setSession.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AuthContext] event:", event, "hasSession:", !!session);
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          setTimeout(() => {
            redirectAfterAuth(session.user, event);
          }, 0);
        }
      }
    );

    const forceOAuthHashRedirect = async () => {
      if (typeof window === "undefined") return;
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const searchParams = new URLSearchParams(window.location.search);
      const isRecovery = hashParams.get("type") === "recovery" || searchParams.get("type") === "recovery";
      const hasOAuthTokens = hashParams.has("access_token") && hashParams.has("refresh_token");

      if (isRecovery || !hasOAuthTokens || !["/auth", "/signup"].includes(path)) return;

      console.log("[AuthContext] OAuth hash detected on auth page");
      const { data: current } = await supabase.auth.getSession();
      if (current.session?.user) {
        await redirectAfterAuth(current.session.user, "hash-existing-session");
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: hashParams.get("access_token")!,
        refresh_token: hashParams.get("refresh_token")!,
      });

      if (error) {
        console.error("[AuthContext] OAuth hash session error:", error);
        return;
      }

      if (data.session?.user) {
        await redirectAfterAuth(data.session.user, "hash-set-session");
      }
    };

    forceOAuthHashRedirect();

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        redirectAfterAuth(session.user, "getSession");
      }
    });

    const safetyTimer = window.setTimeout(async () => {
      if (typeof window === "undefined" || redirectInFlight.current) return;
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      if (!["/auth", "/signup"].includes(path)) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        console.log("[AuthContext] Safety redirect →", getFallbackTarget(session.user));
        window.location.replace(getFallbackTarget(session.user));
      }
    }, 2200);

    return () => {
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string, phone?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone || null,
        },
      },
    });

    // Phone saved via user_metadata during signup

    // Trigger AI welcome call + WhatsApp (fire & forget)
    if (!error && data.user) {
      const country = await fetch("https://ipapi.co/country/")
        .then(r => r.text())
        .catch(() => "");
      fetch("https://apg-welcome-automation.oben-rockman.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName || "",
          email,
          phone: phone || "",
          country,
        }),
      }).catch(() => {});
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
