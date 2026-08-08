"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AuthOAuth = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

function getOAuth(): AuthOAuth | null {
  const a = (supabase.auth as unknown as { oauth?: AuthOAuth }).oauth;
  return a ?? null;
}

function safeNext(pathAndQuery: string) {
  if (!pathAndQuery.startsWith("/")) return "/";
  return pathAndQuery;
}

export default function OAuthConsent() {
  const [authorizationId, setAuthorizationId] = useState("");
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("authorization_id") ?? "";
    setAuthorizationId(id);

    let active = true;
    (async () => {
      if (!id) {
        setError("Missing authorization_id");
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(safeNext(next));
        return;
      }

      const oauth = getOAuth();
      if (!oauth) {
        setError("OAuth client namespace not available. Please update your Supabase client.");
        return;
      }

      const { data, error } = await oauth.getAuthorizationDetails(id);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function decide(approve: boolean) {
    const oauth = getOAuth();
    if (!oauth) return;
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full border border-border rounded-2xl p-8 bg-card shadow-sm">
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">Authorization error</h1>
            <p className="text-muted-foreground text-sm">{error}</p>
          </>
        ) : !details ? (
          <p className="text-muted-foreground text-sm">Loading authorization request…</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mb-2">
              Connect {details.client?.name ?? "an app"} to AutopilotGEO
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              {details.client?.name ?? "This client"} is requesting access to act on your
              AutopilotGEO account. It will be able to read your projects, AEO answers, and
              articles as you.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Deny
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? "Working…" : "Approve"}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
