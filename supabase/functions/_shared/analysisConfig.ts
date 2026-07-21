// Config for the training-analysis feature.
export const ANALYSIS_CONFIG = {
  MODEL: "llama-3.3-70b-versatile",
  TEMPERATURE: 0.5,
  // Narration only (verdict + strengths + recommendations) — kept short.
  MAX_TOKENS: 1200,
  /** Free users get this many analyses per calendar month (upgrade hook). */
  FREE_MONTHLY_LIMIT: 3,
  /** Absolute monthly ceiling even for premium, so a runaway client can't bill. */
  PREMIUM_MONTHLY_SAFETY: 100,
  /** History window feeding the progression section (~4 weeks). */
  HISTORY_DAYS: 28,
} as const;
