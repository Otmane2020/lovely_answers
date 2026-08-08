
CREATE TABLE IF NOT EXISTS public.homepage_video_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('play','progress_25','progress_50','progress_75','complete')),
  session_id text NOT NULL,
  user_agent text,
  referrer text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.homepage_video_events TO anon, authenticated;
GRANT SELECT ON public.homepage_video_events TO authenticated;
GRANT ALL ON public.homepage_video_events TO service_role;

ALTER TABLE public.homepage_video_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert video events"
  ON public.homepage_video_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admins can read video events"
  ON public.homepage_video_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_hve_video_event ON public.homepage_video_events (video_key, event_type);
CREATE INDEX IF NOT EXISTS idx_hve_created_at ON public.homepage_video_events (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hve_session_event ON public.homepage_video_events (session_id, video_key, event_type);
