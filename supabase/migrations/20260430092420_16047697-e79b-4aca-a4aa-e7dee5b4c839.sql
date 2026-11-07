CREATE TABLE public.inbox_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,
  raw_payload JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_emails_received_at ON public.inbox_emails(received_at DESC);
CREATE INDEX idx_inbox_emails_from_email ON public.inbox_emails(from_email);

ALTER TABLE public.inbox_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view inbox emails"
ON public.inbox_emails FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update inbox emails"
ON public.inbox_emails FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete inbox emails"
ON public.inbox_emails FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role can insert inbox emails"
ON public.inbox_emails FOR INSERT
WITH CHECK (true);