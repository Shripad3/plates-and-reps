# Fitness App — Technical Specification

## v1.0 launch scope (June 2026)

Shipped for pre-launch: paid freemium (RevenueCat), security hardening, 30-day free history, AI usage limits, paywall + upgrade CTAs, recent foods, profile/goal editing, workout session detail, routine edit/delete, feed-only social (challenges hidden), Sentry, privacy/terms screens.

Deferred to v1.1: Apple Sign-In, Apple Health sync, push notifications, group challenges/leaderboards, meal/workout plan generation, progress photos, cardio module, rest timer UI, Drizzle/SQLite offline (runtime uses AsyncStorage).

---

## Decisions Summary (from planning)

| Question | Decision |
|---|---|
| Platform | iOS first → Android ~3–6 months later |
| Monetisation | Freemium — free core, premium subscription unlocks AI + advanced analytics |
| Wearables | Apple Health + Google Fit passive sync; native Watch/WearOS deferred to Phase 3 |
| Offline | Core logging offline (food + workouts); AI, photo analysis, social require internet |

---

## Tech Stack

### Mobile App

| Layer | Choice | Reason |
|---|---|---|
| Framework | React Native + Expo SDK 54 (dev client) | Cross-platform from one codebase; easy iOS→Android transition; Expo ecosystem covers camera, AV, health |
| Language | TypeScript | Type safety across app + shared types with backend |
| Navigation | expo-router (file-based) | Best-in-class DX with Expo, deep linking built in |
| Styling | NativeWind v4 (Tailwind for RN) | Consistent design tokens, rapid UI iteration |
| Global State | Zustand | Lightweight, no boilerplate |
| Server State / Cache | TanStack Query v5 | Offline-first caching, background sync, query invalidation for real-time social feed |
| Offline queue | Zustand + AsyncStorage persist | Pending nutrition logs and completed workouts queue locally; `useOfflineSync` syncs on reconnect |
| Camera / Barcode | expo-camera + expo-barcode-scanner | Barcode scanning for food; camera for progress photos |
| Voice | expo-av | Record audio → send to Whisper for transcription |
| Health Sync | react-native-health (iOS) | Apple Health read/write for steps, workouts, body metrics |
| Push Notifications | Expo Push Notifications + APNs | Streak reminders, accountability partner nudges, social reactions |
| Secure Storage | expo-secure-store | JWT token storage |
| Analytics | (planned) PostHog React Native | Product analytics, feature flags for freemium gating |
| Error Tracking | `lib/errorReporting.ts` + root ErrorBoundary | Client error capture; Sentry can be wired via `EXPO_PUBLIC_SENTRY_DSN` later |

### Backend

| Layer | Choice | Reason |
|---|---|---|
| Database | Supabase (PostgreSQL 15) | Row-level security for social privacy, full-text search, JSONB for flexible data |
| Auth | Supabase Auth | Magic link + Apple Sign-In + Google OAuth; JWT tokens |
| File Storage | Supabase Storage | Progress photos, food photos (AI analysis input) |
| Real-time | Supabase Realtime | Social feed live updates, accountability partner activity |
| API | Supabase Auto-generated REST + PostgREST | Standard CRUD, filtered by RLS |
| Edge Functions | Supabase Edge Functions (Deno/TypeScript) | AI orchestration, Whisper calls, Vision calls, webhook handlers |
| Background Jobs | pg_cron (Supabase) | Weekly review generation, streak calculations, daily readiness score |

### AI Layer

| Capability | Service | Notes |
|---|---|---|
| Chatbot + Tool Use | Groq Llama 3.3 70B | Function calling with 6 tools; SSE streaming; free-tier limits enforced server-side |
| Photo Food Analysis | Groq vision (`analyze-food-photo`) | Camera photo → structured JSON of foods + estimated macros |
| Voice Logging | Groq Whisper + Llama (`transcribe-voice`) | Audio → transcript → parsed food items |
| Food search | Open Food Facts + Supabase `foods` cache | `search-foods` edge function with nightly `sync-food-catalog` |

### Third-party Data APIs

| Data | Service | Notes |
|---|---|---|
| Food database + barcodes | Open Food Facts (free) + Nutritionix API (premium tier) | OFFs for barcode scanning; Nutritionix for restaurant meals and branded foods |
| USDA nutrition data | FoodData Central API | Authoritative macro data for generic foods |
| Exercise library | Wger REST API (open source) | 800+ exercises with muscle groups; self-hostable |

---

## Project Structure

```
app/
├── mobile/                  # Expo React Native app
│   ├── app/                 # expo-router file-based routes
│   │   ├── (auth)/          # Unauthenticated routes (login, onboarding)
│   │   ├── (tabs)/          # Main tab navigation
│   │   │   ├── home/        # Dashboard
│   │   │   ├── nutrition/   # Food logging
│   │   │   ├── workouts/    # Workout tracking
│   │   │   ├── social/      # Feed, challenges
│   │   │   └── profile/     # Progress, settings
│   │   ├── chat/            # AI chatbot screen
│   │   └── _layout.tsx
│   ├── components/          # Reusable UI components
│   ├── stores/              # Zustand stores
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Supabase client, API helpers
│   ├── db/                  # Drizzle ORM local schema
│   └── types/               # Shared TypeScript types
├── supabase/
│   ├── migrations/          # SQL migration files
│   ├── functions/           # Edge Functions (Deno)
│   │   ├── ai-chat/         # Chatbot orchestration
│   │   ├── analyze-food-photo/
│   │   ├── transcribe-voice/
│   │   └── generate-weekly-review/
│   └── seed.sql             # Exercise library + food samples
└── TECHNICAL_SPEC.md
```

---

## Data Model

### Users & Auth

```sql
-- Managed by Supabase Auth; extended by:
CREATE TABLE public.user_profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url   text,
  date_of_birth date,
  sex          text CHECK (sex IN ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm    numeric(5,1),
  activity_level text CHECK (activity_level IN ('sedentary','lightly_active','moderately_active','very_active','extra_active')),
  is_premium   boolean NOT NULL DEFAULT false,
  premium_until timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

### Goals

```sql
CREATE TABLE public.user_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  goal_type       text NOT NULL CHECK (goal_type IN ('weight_loss','muscle_gain','maintenance','custom')),
  target_weight_kg numeric(5,2),
  target_calories  integer,
  target_protein_g numeric(6,1),
  target_carbs_g   numeric(6,1),
  target_fat_g     numeric(6,1),
  target_water_ml  integer DEFAULT 2500,
  weekly_workout_target integer DEFAULT 3,
  start_date      date NOT NULL DEFAULT CURRENT_DATE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### Body Metrics

```sql
CREATE TABLE public.body_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  date         date NOT NULL,
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,1),
  measurements jsonb, -- { waist_cm, chest_cm, hips_cm, left_arm_cm, right_arm_cm, ... }
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE public.progress_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  photo_url   text NOT NULL,
  date        date NOT NULL,
  note        text,
  visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','friends','public')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Nutrition

```sql
CREATE TABLE public.foods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  brand            text,
  barcode          text UNIQUE,
  serving_size_g   numeric(7,2) NOT NULL DEFAULT 100,
  serving_label    text DEFAULT '100g',
  calories_per_serving numeric(7,1) NOT NULL,
  protein_g        numeric(6,2) NOT NULL DEFAULT 0,
  carbs_g          numeric(6,2) NOT NULL DEFAULT 0,
  fat_g            numeric(6,2) NOT NULL DEFAULT 0,
  fiber_g          numeric(6,2),
  sugar_g          numeric(6,2),
  sodium_mg        numeric(7,2),
  source           text DEFAULT 'user' CHECK (source IN ('usda','open_food_facts','nutritionix','user')),
  created_by       uuid REFERENCES user_profiles(id),
  is_verified      boolean DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX foods_name_search ON foods USING GIN (to_tsvector('english', name));
CREATE INDEX foods_barcode_idx ON foods (barcode) WHERE barcode IS NOT NULL;

CREATE TABLE public.nutrition_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  food_id      uuid REFERENCES foods(id),
  meal_type    text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  date         date NOT NULL,
  servings     numeric(6,2) NOT NULL DEFAULT 1,
  calories     numeric(7,1) NOT NULL,
  protein_g    numeric(6,2) NOT NULL DEFAULT 0,
  carbs_g      numeric(6,2) NOT NULL DEFAULT 0,
  fat_g        numeric(6,2) NOT NULL DEFAULT 0,
  food_name    text, -- cached name for AI-estimated entries without food_id
  log_method   text DEFAULT 'manual' CHECK (log_method IN ('manual','barcode','voice','photo_ai','chatbot')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nutrition_logs_user_date ON nutrition_logs (user_id, date);

CREATE TABLE public.water_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  date       date NOT NULL,
  amount_ml  integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Workouts

```sql
CREATE TABLE public.exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT '{}',  -- ['chest','triceps']
  equipment     text[] DEFAULT '{}',
  category      text CHECK (category IN ('strength','cardio','flexibility','sport')),
  instructions  text,
  demo_url      text,
  is_custom     boolean DEFAULT false,
  created_by    uuid REFERENCES user_profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workout_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  is_public    boolean DEFAULT false,
  exercises    jsonb NOT NULL DEFAULT '[]',
  -- [{ exercise_id, order, sets: [{ target_reps, target_weight_kg, rest_seconds }] }]
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workout_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES workout_templates(id),
  name          text NOT NULL,
  started_at    timestamptz NOT NULL,
  completed_at  timestamptz,
  duration_seconds integer,
  notes         text,
  is_synced     boolean NOT NULL DEFAULT true, -- false when created offline
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workout_sessions_user_date ON workout_sessions (user_id, started_at DESC);

CREATE TABLE public.workout_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id      uuid NOT NULL REFERENCES exercises(id),
  set_number       integer NOT NULL,
  reps             integer,
  weight_kg        numeric(6,2),
  duration_seconds integer,
  distance_meters  numeric(8,2),
  rpe              integer CHECK (rpe BETWEEN 1 AND 10),
  is_warmup        boolean DEFAULT false,
  completed_at     timestamptz
);

CREATE TABLE public.cardio_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  activity_type    text NOT NULL CHECK (activity_type IN ('run','walk','cycle','swim','rowing','elliptical','other')),
  started_at       timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  distance_meters  numeric(8,2),
  calories_burned  integer,
  avg_heart_rate   integer,
  route_data       jsonb, -- optional GPS polyline
  notes            text,
  is_synced        boolean NOT NULL DEFAULT true
);
```

### Social

```sql
CREATE TABLE public.social_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  following_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  connection_type text NOT NULL DEFAULT 'follow' CHECK (connection_type IN ('follow','accountability_partner')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE TABLE public.activity_feed (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'workout_completed','cardio_completed','streak_achieved',
    'challenge_won','challenge_joined','body_metric_logged','pr_achieved'
  )),
  reference_id  uuid, -- ID of the related entity
  metadata      jsonb, -- { workout_name, duration, calories, streak_count, ... }
  visibility    text NOT NULL DEFAULT 'friends' CHECK (visibility IN ('friends','public','private')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_feed_user_date ON activity_feed (user_id, created_at DESC);

CREATE TABLE public.feed_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id  uuid NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'fire', -- 'fire','flex','heart','clap'
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_item_id, user_id)
);

CREATE TABLE public.feed_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  challenge_type    text NOT NULL CHECK (challenge_type IN (
    'consistency','daily_steps','protein_goal','workout_count','calorie_goal','cardio_distance'
  )),
  target_value      numeric NOT NULL,   -- e.g. 30 (days), 10000 (steps), 7 (workouts)
  target_unit       text,              -- 'days','steps','workouts','km'
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  is_public         boolean DEFAULT false,
  max_participants  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.challenge_participants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id      uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  current_progress  numeric NOT NULL DEFAULT 0,
  completed_at      timestamptz,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
```

### AI Chat

```sql
CREATE TABLE public.chat_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title      text, -- auto-generated from first message
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content         text,
  tool_calls      jsonb, -- OpenAI tool_calls array
  tool_call_id    text,  -- for tool result messages
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conv ON chat_messages (conversation_id, created_at);
```

### Notifications & Streaks

```sql
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
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

CREATE TABLE public.user_streaks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  streak_type     text NOT NULL CHECK (streak_type IN ('logging','workout','protein_goal')),
  current_streak  integer NOT NULL DEFAULT 0,
  longest_streak  integer NOT NULL DEFAULT 0,
  last_logged_date date,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, streak_type)
);
```

---

## AI Architecture

### Overview

```
Mobile App
    │
    │  POST /functions/v1/ai-chat  (streaming SSE)
    ▼
Supabase Edge Function: ai-chat
    │
    ├── 1. Load user context (Supabase queries)
    │       - user profile + goals
    │       - today's nutrition summary
    │       - recent 7-day workout history
    │       - active challenges + streaks
    │
    ├── 2. Assemble messages array
    │       - system prompt (user context injected)
    │       - last 20 chat_messages from DB
    │       - new user message
    │
    ├── 3. Call OpenAI GPT-4o with tools (streaming)
    │
    ├── 4. Execute tool calls (if any)
    │       - read/write Supabase directly
    │
    ├── 5. Stream response back to client
    │
    └── 6. Persist messages to chat_messages table
```

### System Prompt Template

```
You are a personal fitness coach inside a fitness tracking app. You have full access
to the user's data and can take actions on their behalf.

## User Profile
Name: {display_name} | Age: {age} | Sex: {sex} | Height: {height_cm}cm
Activity level: {activity_level}

## Current Goals
Goal: {goal_type} | Calories: {target_calories} kcal
Protein: {target_protein_g}g | Carbs: {target_carbs_g}g | Fat: {target_fat_g}g
Weekly workouts: {weekly_workout_target}

## Today ({today_date})
Calories: {calories_today} / {target_calories} kcal ({calories_remaining} remaining)
Protein: {protein_today}g / {target_protein_g}g
Workouts logged today: {workouts_today}
Water: {water_today}ml / {target_water_ml}ml

## Recent Workout History (last 7 days)
{workout_summary}

## Active Streaks
Logging streak: {logging_streak} days | Workout streak: {workout_streak} days

## Active Challenges
{challenges_summary}

Be concise, warm, and motivating. When taking actions (logging food, creating workouts),
always confirm what you did. If the user asks about something you cannot do,
explain what you can help with instead.
```

### Tool Definitions (12 tools)

| Tool | Description | Access |
|---|---|---|
| `get_nutrition_summary` | Get calorie + macro totals for a date (default: today) | Read |
| `log_food` | Add a food entry to nutrition_logs | Write |
| `search_food` | Search food database by name (returns top 5 matches) | Read |
| `get_workout_history` | Get workout sessions for last N days | Read |
| `create_workout_session` | Create and log a workout session with exercises | Write |
| `get_user_goals` | Fetch current active goal and progress metrics | Read |
| `update_user_goals` | Modify calorie/macro targets (requires confirmation) | Write |
| `log_body_metric` | Log weight or body measurements | Write |
| `generate_meal_plan` | Generate a structured meal plan for N days | Read/Compute |
| `generate_workout_plan` | Generate a workout program for a goal + frequency | Read/Compute |
| `get_progress_summary` | Get progress overview: weight trend, workout adherence | Read |
| `get_challenge_status` | Get progress for active challenges | Read |

### Photo Food Analysis Flow

```
1. User taps camera icon in nutrition screen
2. App captures photo → uploads to Supabase Storage (temp bucket)
3. Signed URL sent to Edge Function: analyze-food-photo
4. Edge Function calls GPT-4o with vision:
   Prompt: "Identify all food items visible. For each item, estimate:
            - food name, portion size, calories, protein_g, carbs_g, fat_g.
            Return as JSON array: [{name, portion_description, calories, protein_g, carbs_g, fat_g}]"
5. Response parsed → displayed in confirmation UI
6. User adjusts quantities if needed → confirms → logged to nutrition_logs
7. Temp photo deleted from storage
```

### Voice Logging Flow

```
1. User holds mic button in nutrition or chat screen
2. expo-av records audio → saves as .m4a
3. Audio file uploaded to Edge Function: transcribe-voice
4. Edge Function calls Whisper API → returns transcript
5. Transcript sent to GPT-4o with parsing prompt:
   "Extract food items from this text: '{transcript}'
    Return JSON: [{food_name, quantity, unit, meal_type}]"
6. Parsed items shown in confirmation UI
7. User confirms → food_id lookup → logged to nutrition_logs
```

### Offline Sync Strategy

```
Offline queue (expo-sqlite):
  - nutrition_logs_queue: pending food logs
  - workout_sessions_queue: pending workout sessions + sets
  - water_logs_queue: pending water logs

On reconnect:
  1. Detect network restored (NetInfo)
  2. Read all queued rows
  3. Batch upsert to Supabase (conflict resolution: client wins for own logs)
  4. Clear queue on success
  5. Pull down any server changes since last_sync_at

Conflict resolution:
  - User's own logs: client always wins (last write wins by created_at)
  - Social data: server wins (feed, reactions, challenges)
```

### Freemium Gate

| Feature | Free | Premium |
|---|---|---|
| Calorie + macro logging | Unlimited | Unlimited |
| Workout tracking | Unlimited | Unlimited |
| AI chat | 10 messages/day | Unlimited |
| Photo food analysis | 3/day | Unlimited |
| Voice logging | 5/day | Unlimited |
| Social feed + challenges | Full | Full |
| Advanced analytics + charts | 30-day history | Full history |
| Workout plan generation | 1/month | Unlimited |
| Weekly AI review | — | Included |
| Custom macros + goals | Basic | Full (TDEE calculator, etc.) |

---

## Row-Level Security Policies (Key Examples)

```sql
-- Users can only read/write their own data
ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_logs" ON nutrition_logs
  USING (user_id = auth.uid());

-- Activity feed: visible to self + followers only
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_visibility" ON activity_feed
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND
      EXISTS (
        SELECT 1 FROM social_connections
        WHERE follower_id = auth.uid() AND following_id = activity_feed.user_id
      )
    )
  );
```

---

## Phase Delivery Summary

### Phase 1 — Core Loop (Months 1–3)
- Expo project setup + Supabase backend
- Auth (email magic link + Apple Sign-In)
- Nutrition tracking (manual + barcode)
- Workout tracking (templates + active session)
- Goals + body metrics
- AI chatbot (basic Q&A + logging actions, 10 msg/day free limit)
- Offline queue for food + workout logs

### Phase 2 — Differentiation (Months 3–5)
- Photo food logging (Vision API)
- Voice logging (Whisper API)
- Social layer: friends, activity feed, accountability partners
- Group challenges + leaderboards
- Workout sharing cards (exportable)
- Freemium paywall + subscription (RevenueCat)

### Phase 3 — Polish & Growth (Months 5–8)
- Apple Health / Google Fit integration
- Weekly AI review (premium)
- Advanced analytics (premium)
- Apple Watch companion app
- WearOS companion app
- Referral program + social invite flow
