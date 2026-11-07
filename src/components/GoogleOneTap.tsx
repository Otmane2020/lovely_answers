"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (callback?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
            getNotDisplayedReason: () => string;
          }) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

export function GoogleOneTap() {
  const { user } = useAuth();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Don't show One Tap if user is already logged in
    if (user) return;

    const loadGoogleScript = () => {
      if (document.getElementById("google-one-tap-script")) {
        initializeOneTap();
        return;
      }

      const script = document.createElement("script");
      script.id = "google-one-tap-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeOneTap;
      document.head.appendChild(script);
    };

    const initializeOneTap = () => {
      if (!window.google || initialized) return;

      // Use Lovable Cloud's managed Google OAuth
      // The actual sign-in will redirect through Lovable's OAuth flow
      window.google.accounts.id.initialize({
        // This is a placeholder - One Tap will just trigger our OAuth flow
        client_id: "lovable-managed",
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.log("One Tap not displayed:", notification.getNotDisplayedReason());
          // Fallback: trigger normal OAuth flow silently in background
        }
      });

      setInitialized(true);
    };

    const handleCredentialResponse = async () => {
      // Instead of handling the credential directly,
      // we trigger Lovable's managed OAuth flow
      try {
        const { error } = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: `${window.location.origin}/auth`,
        });
        if (error) {
          toast.error("Erreur de connexion Google");
          console.error("Google OAuth error:", error);
        }
      } catch (err) {
        toast.error("Erreur de connexion");
        console.error("Google sign in error:", err);
      }
    };

    // Small delay to ensure page is ready
    const timer = setTimeout(loadGoogleScript, 1000);

    return () => {
      clearTimeout(timer);
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [user, initialized]);

  // This component doesn't render anything visible
  // Google One Tap creates its own UI overlay
  return null;
}
