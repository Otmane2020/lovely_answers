-- Helper: ensure slug is unique per (project_id, slug) within a target table
CREATE OR REPLACE FUNCTION public.ensure_unique_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug text;
  candidate text;
  suffix int := 2;
  exists_row boolean;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    RETURN NEW;
  END IF;

  base_slug := NEW.slug;
  candidate := base_slug;

  LOOP
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM public.%I WHERE project_id = $1 AND slug = $2 AND id <> $3)',
      TG_TABLE_NAME
    )
    INTO exists_row
    USING NEW.project_id, candidate, COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    EXIT WHEN NOT exists_row;

    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
    IF suffix > 200 THEN
      candidate := base_slug || '-' || substr(md5(random()::text), 1, 6);
      EXIT;
    END IF;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_answers_unique_slug ON public.answers;
CREATE TRIGGER trg_answers_unique_slug
BEFORE INSERT ON public.answers
FOR EACH ROW
EXECUTE FUNCTION public.ensure_unique_slug();

DROP TRIGGER IF EXISTS trg_local_answers_unique_slug ON public.local_answers;
CREATE TRIGGER trg_local_answers_unique_slug
BEFORE INSERT ON public.local_answers
FOR EACH ROW
EXECUTE FUNCTION public.ensure_unique_slug();

DROP TRIGGER IF EXISTS trg_articles_unique_slug ON public.articles;
CREATE TRIGGER trg_articles_unique_slug
BEFORE INSERT ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_unique_slug();