// Central config for AI plan generation. The app has its own mirror of the
// user-facing values (trial length) in the client config; keep them in sync.

export const AI_PLAN_CONFIG = {
  /** Full-experience model for trial + paid users. */
  MODEL: "llama-3.3-70b-versatile",
  TEMPERATURE: 0.4,
  MAX_TOKENS: 6000,
  /** Default program length when the model isn't told otherwise. */
  DEFAULT_PLAN_WEEKS: 4,
  /** A training day below this many exercises triggers one repair retry. */
  MIN_EXERCISES_PER_DAY: 4,
  /** Free trial length, deferred to first successful generation. */
  TRIAL_DAYS: 7,
  /** Absolute per-day safety cap on generations (applies even to paid). */
  DAILY_SAFETY_LIMIT: 20,
} as const;

export const TRIAL_MS = AI_PLAN_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
