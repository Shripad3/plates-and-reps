# Plates & Reps

**Track in seconds. Stay accountable together.**

A fitness mobile app with calorie/macro tracking, workout logging, a social accountability layer, and a context-aware AI coach.

---

## Project Structure

```
app/
├── mobile/          # Expo React Native app (iOS first)
├── supabase/        # Backend: database, edge functions, migrations
└── TECHNICAL_SPEC.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo SDK 54, TypeScript |
| Navigation | expo-router (file-based) |
| Styling | NativeWind v4 (Tailwind CSS) |
| State | Zustand + TanStack Query v5 |
| Offline queue | AsyncStorage-backed pending logs (nutrition + workouts) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| AI | Groq (chat + function calling + vision + transcription) with server-side free-tier limits |
| Auth | Supabase Auth (email/password; Apple Sign-In planned for v1.1) |
| Monetization | RevenueCat (iOS subscriptions) |
| Observability | Sentry (`EXPO_PUBLIC_SENTRY_DSN`) |

---

## Getting Started

### 1. Supabase Setup

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Start local Supabase
cd supabase
supabase start

# Run migrations
supabase db reset
```

Or create a project on [supabase.com](https://supabase.com) and apply migrations from the Dashboard SQL editor.

Set Edge Function secrets (get a free key at [console.groq.com/keys](https://console.groq.com/keys)):
```bash
supabase secrets set GROQ_API_KEY=gsk_... --project-ref jahppennwbgcwfmqlgqh
```

### 2. Mobile App

```bash
cd mobile

# Copy environment file
cp .env.example .env.local

# Fill in your Supabase URL and anon key in .env.local

# Install dependencies (already done)
npm install

# Start the dev server
npx expo start

# Run on iOS simulator
npx expo run:ios
```

---

## Key Features (Phase 1)

- **Nutrition tracking** — manual search, barcode scanner, AI voice/photo logging
- **Nutrition tracking** — manual search, barcode, recent foods one-tap, AI voice/photo logging
- **Workout tracking** — active session, set/rep logging, routines with edit/delete
- **AI Coach** — context-aware chatbot with 8 tools (log food, check macros, update profile, etc.)
- **Social layer** — friends feed and reactions (challenges deferred to v1.1)
- **Progress tracking** — weight log, chart with 30-day free / full history for premium
- **Offline mode** — AsyncStorage queue for nutrition and workouts; auto-syncs on reconnect
- **Freemium** — RevenueCat paywall; AI and history limits enforced server-side (`FREE_TIER`)

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/.env.local` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/.env.local` | Supabase anon (public) key |
| `EXPO_PUBLIC_SENTRY_DSN` | `mobile/.env.local` (optional) | Sentry DSN for production crash reporting |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | `mobile/.env.local` | RevenueCat public API key for iOS IAP |
| `REVENUECAT_WEBHOOK_SECRET` | Supabase Edge Function secrets | Bearer token for `revenuecat-webhook` |
| `GROQ_API_KEY` | Supabase Edge Function secrets | Groq API key for all AI features |
| `GROQ_MODEL` | Supabase Edge Function secrets (optional) | Chat model override for `ai-chat` |
| `GROQ_VISION_MODEL` | Supabase Edge Function secrets (optional) | Vision model override for `analyze-food-photo` |
| `GROQ_TRANSCRIBE_MODEL` | Supabase Edge Function secrets (optional) | Audio model override for `transcribe-voice` |
| `GROQ_TEXT_MODEL` | Supabase Edge Function secrets (optional) | Transcript parser model for `transcribe-voice` |
| `FOOD_SYNC_SECRET` | Supabase Edge Function secrets (required) | Bearer token for `sync-food-catalog` (no public access) |

### Nightly Food Catalog Sync

`searchFoods` now records popular terms and auto-caches Open Food Facts results into `foods`.

For nightly growth of your local catalog, schedule the edge function:

```bash
supabase functions deploy sync-food-catalog
```

Then in Supabase Dashboard > Scheduled functions, invoke `sync-food-catalog` nightly with:

- Method: `POST`
- JSON body (optional):
  - `{"term_limit": 20, "per_term": 25}`
- Header (required):
  - `Authorization: Bearer <FOOD_SYNC_SECRET>`

---

## Database

All schema migrations are in `supabase/migrations/`. Apply with:
```bash
supabase db reset   # local
# or
supabase db push    # remote
```

---

## Deployment

```bash
# Deploy Edge Functions
npx supabase functions deploy ai-chat --project-ref <your-project-ref>
npx supabase functions deploy search-foods --project-ref <your-project-ref>
npx supabase functions deploy analyze-food-photo --project-ref <your-project-ref>
npx supabase functions deploy transcribe-voice --project-ref <your-project-ref>
npx supabase functions deploy sync-food-catalog --project-ref <your-project-ref>
npx supabase functions deploy revenuecat-webhook --project-ref <your-project-ref>

# Build iOS (TestFlight)
cd mobile && eas build --platform ios
eas submit --platform ios
```

### TestFlight beta

1. Configure RevenueCat products and entitlements (`premium`) in App Store Connect.
2. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and deploy `revenuecat-webhook`.
3. Run a 2-week TestFlight beta (10–20 users) before public launch.
4. Enable email confirmation in Supabase Auth for production.

### App Store assets (screenshot focus)

1. One-tap food log / recent foods
2. Active workout session
3. Progress weight chart
4. AI voice log (premium hook)

See `TECHNICAL_SPEC.md` for full architecture documentation.
