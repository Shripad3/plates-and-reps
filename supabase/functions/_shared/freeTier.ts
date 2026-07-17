export const FREE_TIER = {
  AI_CHAT_DAILY_LIMIT: 10,
  PHOTO_ANALYSIS_DAILY_LIMIT: 3,
  VOICE_LOG_DAILY_LIMIT: 5,
  FOOD_SEARCH_DAILY_LIMIT: 100,
  RC_SYNC_DAILY_LIMIT: 10,
} as const;

// Absolute per-day safety ceilings that apply even to premium users, so a
// leaked/shared account or a client retry-loop can't run up an unbounded bill.
// Set far above any realistic human daily use.
export const PREMIUM_TIER = {
  AI_CHAT_DAILY_LIMIT: 300,
  PHOTO_ANALYSIS_DAILY_LIMIT: 100,
  VOICE_LOG_DAILY_LIMIT: 100,
  FOOD_SEARCH_DAILY_LIMIT: 1000,
  RC_SYNC_DAILY_LIMIT: 50,
} as const;
