-- Exercise library schema: external IDs, alias search, and search RPC

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS exercises_external_id_unique
  ON public.exercises (external_id) WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_exercises(
  search_query text DEFAULT '',
  muscle_filter text DEFAULT NULL,
  result_limit integer DEFAULT 50
)
RETURNS SETOF public.exercises
LANGUAGE sql
STABLE
AS $$
  WITH normalized AS (
    SELECT trim(regexp_replace(lower(coalesce(search_query, '')), '\s+', ' ', 'g')) AS q
  ),
  words AS (
    SELECT unnest(string_to_array((SELECT q FROM normalized), ' ')) AS word
    WHERE (SELECT q FROM normalized) <> ''
  )
  SELECT e.*
  FROM public.exercises e
  CROSS JOIN normalized n
  WHERE (
    n.q = ''
    OR lower(e.name) LIKE '%' || n.q || '%'
    OR EXISTS (
      SELECT 1 FROM unnest(e.search_aliases) alias
      WHERE lower(alias) LIKE '%' || n.q || '%'
    )
    OR NOT EXISTS (SELECT 1 FROM words)
    OR NOT EXISTS (
      SELECT 1 FROM words w
      WHERE lower(e.name) NOT LIKE '%' || w.word || '%'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(e.search_aliases) alias
          WHERE lower(alias) LIKE '%' || w.word || '%'
        )
    )
  )
  AND (
    muscle_filter IS NULL
    OR muscle_filter = ''
    OR e.muscle_groups @> ARRAY[muscle_filter]
  )
  ORDER BY
    CASE
      WHEN n.q <> '' AND lower(e.name) = n.q THEN 0
      WHEN n.q <> '' AND lower(e.name) LIKE n.q || '%' THEN 1
      WHEN n.q <> '' AND EXISTS (
        SELECT 1 FROM unnest(e.search_aliases) alias WHERE lower(alias) = n.q
      ) THEN 2
      ELSE 3
    END,
    e.name
  LIMIT GREATEST(1, LEAST(result_limit, 100));
$$;
