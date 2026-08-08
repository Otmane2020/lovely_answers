
-- ============================================================================
-- Security hardening: lock down tables flagged by the security scanner.
-- Edge functions use the service-role key and bypass RLS, so backend writes
-- (analytics ingestion, onboarding webhooks, cart APIs, audit pipeline) keep
-- working. Direct client reads/updates of other users' rows are blocked.
-- ============================================================================

-- ---------- carts: scope SELECT/UPDATE to the row owner only ----------
DROP POLICY IF EXISTS "Users can view their own carts"   ON public.carts;
DROP POLICY IF EXISTS "Users can update their own carts" ON public.carts;

CREATE POLICY "Users can view their own carts"
  ON public.carts FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update their own carts"
  ON public.carts FOR UPDATE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ---------- onboarding_sessions: kill public read & update ----------
DROP POLICY IF EXISTS "Allow anonymous select for onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow anonymous update for onboarding_sessions" ON public.onboarding_sessions;

-- Only admins can read leads; UPDATE must go through service-role edge functions.
CREATE POLICY "Admins can read onboarding sessions"
  ON public.onboarding_sessions FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update onboarding sessions"
  ON public.onboarding_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------- site_audits: hide submitter emails from public ----------
DROP POLICY IF EXISTS "Anyone can view audits by id" ON public.site_audits;
-- Existing "Users can view their project audits" stays; admin-only public read.
CREATE POLICY "Admins can read all site audits"
  ON public.site_audits FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---------- visitor_sessions: kill public select & broad update ----------
DROP POLICY IF EXISTS "Allow anonymous select for visitor_sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Allow anonymous update for visitor_sessions" ON public.visitor_sessions;

CREATE POLICY "Admins can read visitor sessions"
  ON public.visitor_sessions FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- (No public UPDATE — analytics conversion updates must go through an edge
--  function that uses the service role.)

-- ---------- page_views: kill public select ----------
DROP POLICY IF EXISTS "Allow anonymous select for page_views" ON public.page_views;

CREATE POLICY "Admins can read page views"
  ON public.page_views FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
