
CREATE TABLE IF NOT EXISTS public.shopify_installs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  scope TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shopify_oauth_states (
  state TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shopify_installs TO authenticated;
GRANT ALL ON public.shopify_installs TO service_role;
GRANT ALL ON public.shopify_oauth_states TO service_role;

ALTER TABLE public.shopify_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own shopify install"
  ON public.shopify_installs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
