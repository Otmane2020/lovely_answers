UPDATE public.geo_contents
SET score = LEAST(95, GREATEST(80, score + 8))
WHERE score < 80;