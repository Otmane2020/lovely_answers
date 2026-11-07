import { useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "hve_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type EventType = "play" | "progress_25" | "progress_50" | "progress_75" | "complete";

export function useVideoTracking(videoKey: string) {
  const sentRef = useRef<Set<EventType>>(new Set());

  const log = useCallback(
    async (eventType: EventType) => {
      if (sentRef.current.has(eventType)) return;
      sentRef.current.add(eventType);
      try {
        await supabase.from("homepage_video_events").insert({
          video_key: videoKey,
          event_type: eventType,
          session_id: getSessionId(),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          path: typeof window !== "undefined" ? window.location.pathname : null,
        });
      } catch {
        // silent — analytics must never break the page
      }
    },
    [videoKey]
  );

  const handlers = {
    onPlay: () => log("play"),
    onEnded: () => log("complete"),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      if (!v.duration || !isFinite(v.duration)) return;
      const pct = (v.currentTime / v.duration) * 100;
      if (pct >= 75) log("progress_75");
      else if (pct >= 50) log("progress_50");
      else if (pct >= 25) log("progress_25");
    },
  };

  return handlers;
}
