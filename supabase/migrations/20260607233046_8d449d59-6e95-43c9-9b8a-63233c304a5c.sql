
-- reports: restrict insert/update to service_role only
DROP POLICY IF EXISTS "Service role can insert reports" ON public.reports;
DROP POLICY IF EXISTS "Service role can update reports" ON public.reports;

CREATE POLICY "Service role can insert reports"
  ON public.reports FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update reports"
  ON public.reports FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- inbox_emails: restrict insert to service_role only
DROP POLICY IF EXISTS "Service role can insert inbox emails" ON public.inbox_emails;

CREATE POLICY "Service role can insert inbox emails"
  ON public.inbox_emails FOR INSERT
  TO service_role
  WITH CHECK (true);
