
ALTER TABLE public.answers       ADD COLUMN IF NOT EXISTS scheduled_day date;
ALTER TABLE public.articles      ADD COLUMN IF NOT EXISTS scheduled_day date;
ALTER TABLE public.local_answers ADD COLUMN IF NOT EXISTS scheduled_day date;
ALTER TABLE public.geo_contents  ADD COLUMN IF NOT EXISTS scheduled_day date;

CREATE OR REPLACE FUNCTION public.set_scheduled_day()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.scheduled_day := CASE WHEN NEW.scheduled_date IS NULL THEN NULL ELSE (NEW.scheduled_date AT TIME ZONE 'UTC')::date END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_answers_scheduled_day ON public.answers;
DROP TRIGGER IF EXISTS trg_articles_scheduled_day ON public.articles;
DROP TRIGGER IF EXISTS trg_local_answers_scheduled_day ON public.local_answers;
DROP TRIGGER IF EXISTS trg_geo_contents_scheduled_day ON public.geo_contents;

CREATE TRIGGER trg_answers_scheduled_day        BEFORE INSERT OR UPDATE OF scheduled_date ON public.answers       FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_day();
CREATE TRIGGER trg_articles_scheduled_day       BEFORE INSERT OR UPDATE OF scheduled_date ON public.articles      FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_day();
CREATE TRIGGER trg_local_answers_scheduled_day  BEFORE INSERT OR UPDATE OF scheduled_date ON public.local_answers FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_day();
CREATE TRIGGER trg_geo_contents_scheduled_day   BEFORE INSERT OR UPDATE OF scheduled_date ON public.geo_contents  FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_day();

UPDATE public.answers       SET scheduled_day = (scheduled_date AT TIME ZONE 'UTC')::date WHERE scheduled_date IS NOT NULL;
UPDATE public.articles      SET scheduled_day = (scheduled_date AT TIME ZONE 'UTC')::date WHERE scheduled_date IS NOT NULL;
UPDATE public.local_answers SET scheduled_day = (scheduled_date AT TIME ZONE 'UTC')::date WHERE scheduled_date IS NOT NULL;
UPDATE public.geo_contents  SET scheduled_day = (scheduled_date AT TIME ZONE 'UTC')::date WHERE scheduled_date IS NOT NULL;

-- Dedupe based on scheduled_day
-- ARTICLES first (so we can null answers.article_id refs to deleted articles)
WITH dups AS (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(title), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.articles WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
)
UPDATE public.planning SET article_id = NULL WHERE article_id IN (SELECT id FROM dups);

UPDATE public.answers SET article_id = NULL WHERE article_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(title), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.articles WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

DELETE FROM public.articles WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(title), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.articles WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

UPDATE public.planning SET answer_id = NULL WHERE answer_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(question), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.answers WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

DELETE FROM public.answers WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(question), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.answers WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

DELETE FROM public.local_answers WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(question), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.local_answers WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

DELETE FROM public.geo_contents WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, lower(coalesce(title, topic)), scheduled_day ORDER BY created_at ASC) AS rn
    FROM public.geo_contents WHERE scheduled_day IS NOT NULL
  ) s WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS answers_dedup_scheduled_idx
  ON public.answers (project_id, lower(question), scheduled_day)
  WHERE scheduled_day IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS articles_dedup_scheduled_idx
  ON public.articles (project_id, lower(title), scheduled_day)
  WHERE scheduled_day IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS local_answers_dedup_scheduled_idx
  ON public.local_answers (project_id, lower(question), scheduled_day)
  WHERE scheduled_day IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS geo_contents_dedup_scheduled_idx
  ON public.geo_contents (project_id, lower(coalesce(title, topic)), scheduled_day)
  WHERE scheduled_day IS NOT NULL;
