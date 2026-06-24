-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── User Profiles ────────────────────────────────────────────────────────────
CREATE TABLE public.user_profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text UNIQUE NOT NULL,
  display_name     text NOT NULL,
  avatar_url       text,
  date_of_birth    date,
  sex              text CHECK (sex IN ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm        numeric(5,1),
  activity_level   text CHECK (activity_level IN (
    'sedentary','lightly_active','moderately_active','very_active','extra_active'
  )),
  is_premium       boolean NOT NULL DEFAULT false,
  premium_until    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.user_profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY "users_view_others" ON public.user_profiles
  FOR SELECT USING (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── User Goals ───────────────────────────────────────────────────────────────
CREATE TABLE public.user_goals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  goal_type              text NOT NULL CHECK (goal_type IN (
    'weight_loss','muscle_gain','maintenance','custom'
  )),
  target_weight_kg       numeric(5,2),
  target_calories        integer,
  target_protein_g       numeric(6,1),
  target_carbs_g         numeric(6,1),
  target_fat_g           numeric(6,1),
  target_water_ml        integer DEFAULT 2500,
  weekly_workout_target  integer DEFAULT 3,
  start_date             date NOT NULL DEFAULT CURRENT_DATE,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_goals" ON public.user_goals USING (user_id = auth.uid());

-- ─── Body Metrics ─────────────────────────────────────────────────────────────
CREATE TABLE public.body_metrics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  date           date NOT NULL,
  weight_kg      numeric(5,2),
  body_fat_pct   numeric(4,1),
  measurements   jsonb,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_metrics" ON public.body_metrics USING (user_id = auth.uid());

CREATE TABLE public.progress_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  photo_url   text NOT NULL,
  date        date NOT NULL,
  note        text,
  visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','friends','public')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_photos" ON public.progress_photos
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND
      EXISTS (
        SELECT 1 FROM public.social_connections
        WHERE follower_id = auth.uid() AND following_id = progress_photos.user_id
      )
    )
  );

-- ─── Foods ────────────────────────────────────────────────────────────────────
CREATE TABLE public.foods (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  brand                   text,
  barcode                 text,
  serving_size_g          numeric(7,2) NOT NULL DEFAULT 100,
  serving_label           text DEFAULT '100g',
  calories_per_serving    numeric(7,1) NOT NULL,
  protein_g               numeric(6,2) NOT NULL DEFAULT 0,
  carbs_g                 numeric(6,2) NOT NULL DEFAULT 0,
  fat_g                   numeric(6,2) NOT NULL DEFAULT 0,
  fiber_g                 numeric(6,2),
  sugar_g                 numeric(6,2),
  sodium_mg               numeric(7,2),
  source                  text DEFAULT 'user' CHECK (
    source IN ('usda','open_food_facts','nutritionix','user')
  ),
  created_by              uuid REFERENCES public.user_profiles(id),
  is_verified             boolean DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX foods_barcode_idx ON public.foods (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX foods_name_trgm ON public.foods USING GIN (name gin_trgm_ops);
CREATE INDEX foods_name_fts ON public.foods USING GIN (to_tsvector('english', name));

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_foods" ON public.foods FOR SELECT USING (true);
CREATE POLICY "insert_own_foods" ON public.foods FOR INSERT
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ─── Nutrition Logs ───────────────────────────────────────────────────────────
CREATE TABLE public.nutrition_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  food_id      uuid REFERENCES public.foods(id),
  meal_type    text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  date         date NOT NULL,
  servings     numeric(6,2) NOT NULL DEFAULT 1,
  calories     numeric(7,1) NOT NULL,
  protein_g    numeric(6,2) NOT NULL DEFAULT 0,
  carbs_g      numeric(6,2) NOT NULL DEFAULT 0,
  fat_g        numeric(6,2) NOT NULL DEFAULT 0,
  food_name    text,
  log_method   text DEFAULT 'manual' CHECK (
    log_method IN ('manual','barcode','voice','photo_ai','chatbot')
  ),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nutrition_logs_user_date ON public.nutrition_logs (user_id, date);

ALTER TABLE public.nutrition_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_nutrition_logs" ON public.nutrition_logs USING (user_id = auth.uid());

CREATE TABLE public.water_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  date       date NOT NULL,
  amount_ml  integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_water_logs" ON public.water_logs USING (user_id = auth.uid());

-- ─── Exercises ────────────────────────────────────────────────────────────────
CREATE TABLE public.exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT '{}',
  equipment     text[] DEFAULT '{}',
  category      text CHECK (category IN ('strength','cardio','flexibility','sport')),
  instructions  text,
  demo_url      text,
  is_custom     boolean DEFAULT false,
  created_by    uuid REFERENCES public.user_profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exercises_name_trgm ON public.exercises USING GIN (name gin_trgm_ops);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_exercises" ON public.exercises FOR SELECT USING (true);
CREATE POLICY "insert_custom_exercises" ON public.exercises FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- ─── Workout Templates ────────────────────────────────────────────────────────
CREATE TABLE public.workout_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  is_public    boolean DEFAULT false,
  exercises    jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_templates" ON public.workout_templates
  USING (user_id = auth.uid() OR is_public = true);
CREATE POLICY "insert_own_templates" ON public.workout_templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─── Workout Sessions ─────────────────────────────────────────────────────────
CREATE TABLE public.workout_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  template_id      uuid REFERENCES public.workout_templates(id),
  name             text NOT NULL,
  started_at       timestamptz NOT NULL,
  completed_at     timestamptz,
  duration_seconds integer,
  notes            text,
  is_synced        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workout_sessions_user_date ON public.workout_sessions (user_id, started_at DESC);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sessions" ON public.workout_sessions USING (user_id = auth.uid());

CREATE TABLE public.workout_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id      uuid NOT NULL REFERENCES public.exercises(id),
  set_number       integer NOT NULL,
  reps             integer,
  weight_kg        numeric(6,2),
  duration_seconds integer,
  distance_meters  numeric(8,2),
  rpe              integer CHECK (rpe BETWEEN 1 AND 10),
  is_warmup        boolean DEFAULT false,
  completed_at     timestamptz
);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sets" ON public.workout_sets
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions
      WHERE id = workout_sets.session_id AND user_id = auth.uid()
    )
  );

CREATE TABLE public.cardio_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  activity_type    text NOT NULL CHECK (
    activity_type IN ('run','walk','cycle','swim','rowing','elliptical','other')
  ),
  started_at       timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  distance_meters  numeric(8,2),
  calories_burned  integer,
  avg_heart_rate   integer,
  route_data       jsonb,
  notes            text,
  is_synced        boolean NOT NULL DEFAULT true
);

ALTER TABLE public.cardio_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_cardio" ON public.cardio_sessions USING (user_id = auth.uid());

-- ─── Social ───────────────────────────────────────────────────────────────────
CREATE TABLE public.social_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  following_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  connection_type text NOT NULL DEFAULT 'follow' CHECK (
    connection_type IN ('follow','accountability_partner')
  ),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_connections" ON public.social_connections
  USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE TABLE public.activity_feed (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'workout_completed','cardio_completed','streak_achieved',
    'challenge_won','challenge_joined','body_metric_logged','pr_achieved'
  )),
  reference_id  uuid,
  metadata      jsonb DEFAULT '{}',
  visibility    text NOT NULL DEFAULT 'friends' CHECK (
    visibility IN ('friends','public','private')
  ),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_feed_user_date ON public.activity_feed (user_id, created_at DESC);

ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_visibility" ON public.activity_feed
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND
      EXISTS (
        SELECT 1 FROM public.social_connections
        WHERE follower_id = auth.uid() AND following_id = activity_feed.user_id
      )
    )
  );

CREATE TABLE public.feed_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id  uuid NOT NULL REFERENCES public.activity_feed(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'fire',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_item_id, user_id)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_reactions" ON public.feed_reactions FOR SELECT USING (true);
CREATE POLICY "own_reactions" ON public.feed_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE TABLE public.feed_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES public.activity_feed(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_comments" ON public.feed_comments FOR SELECT USING (true);
CREATE POLICY "own_comments" ON public.feed_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── Challenges ───────────────────────────────────────────────────────────────
CREATE TABLE public.challenges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  challenge_type   text NOT NULL CHECK (challenge_type IN (
    'consistency','daily_steps','protein_goal','workout_count','calorie_goal','cardio_distance'
  )),
  target_value     numeric NOT NULL,
  target_unit      text,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  is_public        boolean DEFAULT false,
  max_participants integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_challenges" ON public.challenges
  FOR SELECT USING (is_public = true OR created_by = auth.uid());
CREATE POLICY "insert_challenges" ON public.challenges
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE TABLE public.challenge_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id     uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  current_progress numeric NOT NULL DEFAULT 0,
  completed_at     timestamptz,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_participation" ON public.challenge_participants
  USING (user_id = auth.uid());

-- ─── AI Chat ──────────────────────────────────────────────────────────────────
CREATE TABLE public.chat_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_conversations" ON public.chat_conversations
  USING (user_id = auth.uid());

CREATE TABLE public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content         text,
  tool_calls      jsonb,
  tool_call_id    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conv ON public.chat_messages (conversation_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_messages" ON public.chat_messages
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id AND user_id = auth.uid()
    )
  );

-- ─── Notifications & Streaks ──────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN (
    'accountability_partner_logged','challenge_update','streak_reminder',
    'ai_insight','reaction','comment','friend_request','weekly_review'
  )),
  title      text NOT NULL,
  body       text,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifications" ON public.notifications USING (user_id = auth.uid());

CREATE TABLE public.user_streaks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  streak_type      text NOT NULL CHECK (streak_type IN ('logging','workout','protein_goal')),
  current_streak   integer NOT NULL DEFAULT 0,
  longest_streak   integer NOT NULL DEFAULT 0,
  last_logged_date date,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, streak_type)
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_streaks" ON public.user_streaks USING (user_id = auth.uid());

-- ─── Streak update trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_logging_streak()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  today date := CURRENT_DATE;
  yesterday date := CURRENT_DATE - 1;
  existing record;
BEGIN
  SELECT * INTO existing
  FROM public.user_streaks
  WHERE user_id = NEW.user_id AND streak_type = 'logging';

  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, streak_type, current_streak, longest_streak, last_logged_date)
    VALUES (NEW.user_id, 'logging', 1, 1, today);
  ELSIF existing.last_logged_date = today THEN
    -- Already logged today, no change
    NULL;
  ELSIF existing.last_logged_date = yesterday THEN
    UPDATE public.user_streaks
    SET current_streak = existing.current_streak + 1,
        longest_streak = GREATEST(existing.longest_streak, existing.current_streak + 1),
        last_logged_date = today,
        updated_at = now()
    WHERE user_id = NEW.user_id AND streak_type = 'logging';
  ELSE
    UPDATE public.user_streaks
    SET current_streak = 1,
        last_logged_date = today,
        updated_at = now()
    WHERE user_id = NEW.user_id AND streak_type = 'logging';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_nutrition_logged
  AFTER INSERT ON public.nutrition_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_logging_streak();

-- ─── Storage buckets ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('progress-photos', 'progress-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('food-photos', 'food-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "avatar_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "avatar_own_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "progress_photo_own" ON storage.objects
  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "food_photo_own" ON storage.objects
  USING (bucket_id = 'food-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
