-- Track popular food search terms for background catalog sync
CREATE TABLE IF NOT EXISTS public.food_search_terms (
  term              text PRIMARY KEY,
  search_count      integer NOT NULL DEFAULT 0,
  last_searched_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_search_terms ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_food_search_term(p_term text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(p_term, '')));
BEGIN
  IF length(normalized) < 2 THEN
    RETURN;
  END IF;

  INSERT INTO public.food_search_terms (term, search_count, last_searched_at, updated_at)
  VALUES (normalized, 1, now(), now())
  ON CONFLICT (term)
  DO UPDATE SET
    search_count = food_search_terms.search_count + 1,
    last_searched_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_food_search_term(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_food_search_term(text) TO authenticated;
