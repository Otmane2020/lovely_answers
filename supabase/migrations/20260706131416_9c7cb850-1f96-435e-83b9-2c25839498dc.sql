
ALTER TABLE public.generation_settings
  ADD COLUMN IF NOT EXISTS shopify_shop_info jsonb,
  ADD COLUMN IF NOT EXISTS shopify_pages jsonb,
  ADD COLUMN IF NOT EXISTS shopify_products_index jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS needs_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;
