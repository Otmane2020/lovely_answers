UPDATE public.geo_contents
SET score = GREATEST(45, LEAST(100,
  50 +
  (LENGTH(COALESCE(content, html_content, '')) % 12) +
  CASE WHEN LENGTH(COALESCE(content, html_content, '')) > 1500 THEN 8
       WHEN LENGTH(COALESCE(content, html_content, '')) > 1000 THEN 5
       WHEN LENGTH(COALESCE(content, html_content, '')) > 600 THEN 2
       ELSE -5 END +
  CASE WHEN COALESCE(content, html_content, '') ILIKE '%<h2%' OR COALESCE(content, html_content, '') ILIKE '%## %' THEN 4 ELSE 0 END +
  CASE WHEN COALESCE(content, html_content, '') ~* 'faq|frequently asked' THEN 3 ELSE 0 END +
  CASE WHEN COALESCE(content, html_content, '') ~* '\d+%' THEN 3 ELSE 0 END +
  CASE WHEN COALESCE(content, html_content, '') ~* 'recommend|expert|according to' THEN 3 ELSE 0 END +
  CASE WHEN COALESCE(content, html_content, '') ~* '<li|[-*] ' THEN 2 ELSE -3 END
));