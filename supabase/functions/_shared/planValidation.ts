// Plan validation (§8): parse the model's JSON, keep only real library
// exercises, drop movements that conflict with declared injuries, and clamp
// numbers to sane ranges. Nothing unvalidated is ever returned or stored.

export interface LibraryExercise {
  id: string;
  name: string;
  muscle_groups: string[];
  search_aliases?: string[];
}

export interface InjuryInfo {
  status: "provided" | "skipped";
  areas?: string[];
  avoidMovements?: string[];
  notes?: string;
}

export interface NormalizedSet {
  setNumber: number;
  reps: number;
  weightKg: number;
  notes?: string;
}
export interface NormalizedExercise {
  name: string;        // canonical library name
  exerciseId: string;  // resolved library id
  muscleGroups: string[];
  sets: NormalizedSet[];
}
export interface NormalizedDay {
  dayNumber: number;
  focus: string;
  exercises: NormalizedExercise[];
}
export interface NormalizedWeek {
  weekNumber: number;
  days: NormalizedDay[];
}
export interface NormalizedPlan {
  planName: string;
  goal: string;
  durationWeeks: number;
  weeks: NormalizedWeek[];
  notes?: string;
}

// Bounds
const MAX_WEEKS = 12;
const MAX_DAYS_PER_WEEK = 7;
const MAX_EXERCISES_PER_DAY = 12;
const MAX_SETS_PER_EXERCISE = 10;
const MIN_REPS = 1, MAX_REPS = 100;
const MIN_WEIGHT = 0, MAX_WEIGHT = 500;

// Body-area → muscle-group avoidance map (coarse but safe).
const AREA_TO_MUSCLES: Record<string, string[]> = {
  knee: ["quadriceps", "hamstrings", "calves", "glutes"],
  knees: ["quadriceps", "hamstrings", "calves", "glutes"],
  lower_back: ["lower_back", "back", "spinal_erectors", "erectors"],
  back: ["back", "lower_back", "lats", "spinal_erectors"],
  shoulder: ["shoulders", "deltoids"],
  shoulders: ["shoulders", "deltoids"],
  elbow: ["biceps", "triceps", "forearms"],
  wrist: ["forearms"],
  hip: ["glutes", "hamstrings", "hip_flexors"],
  ankle: ["calves"],
  neck: ["traps", "neck"],
  chest: ["chest"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["the", "a", "with", "and", "to", "of", "for", "on", "your"]);
const tokenize = (s: string) => norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

interface MatchIndex {
  byNorm: Map<string, LibraryExercise>;
  tokens: Map<string, Set<string>>;
}
function buildIndex(library: LibraryExercise[]): MatchIndex {
  const byNorm = new Map<string, LibraryExercise>();
  const tokens = new Map<string, Set<string>>();
  for (const ex of library) {
    const t = new Set(tokenize(ex.name));
    byNorm.set(norm(ex.name), ex);
    // Fold search_aliases into both exact lookup and the token set, so a model
    // name like "Tempo Squat" resolves via the "Slow Squat" entry's alias.
    for (const alias of ex.search_aliases ?? []) {
      const na = norm(alias);
      if (na && !byNorm.has(na)) byNorm.set(na, ex);
      for (const tok of tokenize(alias)) t.add(tok);
    }
    tokens.set(ex.id, t);
  }
  return { byNorm, tokens };
}
/**
 * Resolve a model-provided exercise name to a library entry. Exact match first
 * (name or alias); otherwise the library exercise sharing the most of the
 * model's name tokens, tie-broken toward the closest (fewest extra) name.
 *
 * Approach B: no confidence floor — always take the best token-overlap match
 * so real, runnable movements are never dropped just for imperfect naming. The
 * ONLY drop case is a name that shares zero significant tokens with anything
 * (nothing to map to). Injury conflicts and per-day dedupe are handled by the
 * caller after matching, so safety is preserved.
 */
function matchExercise(
  name: string,
  library: LibraryExercise[],
  index: MatchIndex
): LibraryExercise | null {
  const exact = index.byNorm.get(norm(name));
  if (exact) return exact;

  const target = new Set(tokenize(name));
  if (target.size === 0) return null;

  let best: LibraryExercise | null = null;
  let bestScore = 0;
  let bestExtra = Infinity;
  for (const ex of library) {
    const libTokens = index.tokens.get(ex.id)!;
    let shared = 0;
    for (const t of target) if (libTokens.has(t)) shared++;
    if (shared === 0) continue;
    const score = shared / target.size;
    const extra = libTokens.size - shared;
    if (score > bestScore || (score === bestScore && extra < bestExtra)) {
      best = ex;
      bestScore = score;
      bestExtra = extra;
    }
  }
  return best; // null only when nothing shared a single significant token
}
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), lo), hi);
};
const clampNum = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, lo), hi);
};

export class PlanValidationError extends Error {}

/** Strip accidental markdown fences and parse. Throws PlanValidationError. */
export function parsePlanJson(raw: string): unknown {
  let text = raw.trim();
  // Defensive: remove ```json ... ``` fences if the model added them.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new PlanValidationError("Model did not return valid JSON");
  }
}

function injuryConflict(
  ex: { name: string; muscleGroups: string[] },
  injury: InjuryInfo | null
): boolean {
  if (!injury || injury.status !== "provided") return false;
  const nameLc = ex.name.toLowerCase();

  for (const mv of injury.avoidMovements ?? []) {
    const kw = String(mv).toLowerCase().trim();
    if (kw.length >= 3 && nameLc.includes(kw)) return true;
  }

  const avoid = new Set<string>();
  for (const area of injury.areas ?? []) {
    for (const m of AREA_TO_MUSCLES[norm(String(area)).replace(/ /g, "_")] ?? []) {
      avoid.add(m);
    }
  }
  if (avoid.size > 0) {
    for (const mg of ex.muscleGroups) {
      if (avoid.has(mg.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * Validate + normalize. Returns the cleaned plan (only known, injury-safe
 * exercises with clamped numbers). Throws PlanValidationError if the result
 * can't form a usable plan (→ caller does one repair retry, then errors).
 */
export function validateAndNormalizePlan(
  raw: unknown,
  library: LibraryExercise[],
  injury: InjuryInfo | null
): NormalizedPlan {
  if (!raw || typeof raw !== "object") throw new PlanValidationError("Plan is not an object");
  const p = raw as Record<string, unknown>;

  if (typeof p.planName !== "string" || !p.planName.trim()) {
    throw new PlanValidationError("planName missing");
  }
  if (!Array.isArray(p.weeks) || p.weeks.length === 0) {
    throw new PlanValidationError("weeks missing");
  }

  const index = buildIndex(library);
  const weeks: NormalizedWeek[] = [];
  let totalExercises = 0;

  const rawWeeks = (p.weeks as unknown[]).slice(0, MAX_WEEKS);
  rawWeeks.forEach((wRaw, wi) => {
    const w = (wRaw ?? {}) as Record<string, unknown>;
    const days: NormalizedDay[] = [];
    const rawDays = Array.isArray(w.days) ? (w.days as unknown[]).slice(0, MAX_DAYS_PER_WEEK) : [];

    rawDays.forEach((dRaw, di) => {
      const d = (dRaw ?? {}) as Record<string, unknown>;
      const exercises: NormalizedExercise[] = [];
      const seenIds = new Set<string>(); // dedupe within the day
      const rawEx = Array.isArray(d.exercises)
        ? (d.exercises as unknown[]).slice(0, MAX_EXERCISES_PER_DAY)
        : [];

      for (const eRaw of rawEx) {
        const e = (eRaw ?? {}) as Record<string, unknown>;
        if (typeof e.name !== "string") continue;
        const lib = matchExercise(e.name, library, index);
        if (!lib) continue; // nothing in the library shared a token — skip
        if (seenIds.has(lib.id)) continue; // two names resolved to the same entry

        const mapped = { name: lib.name, muscleGroups: lib.muscle_groups ?? [] };
        if (injuryConflict(mapped, injury)) continue; // drop injury conflict

        const rawSets = Array.isArray(e.sets)
          ? (e.sets as unknown[]).slice(0, MAX_SETS_PER_EXERCISE)
          : [];
        const sets: NormalizedSet[] = rawSets.map((sRaw, si) => {
          const s = (sRaw ?? {}) as Record<string, unknown>;
          const out: NormalizedSet = {
            setNumber: si + 1,
            reps: clampInt(s.reps, MIN_REPS, MAX_REPS, 10),
            weightKg: clampNum(s.weightKg, MIN_WEIGHT, MAX_WEIGHT, 0),
          };
          if (typeof s.notes === "string" && s.notes.trim()) {
            out.notes = s.notes.trim().slice(0, 200);
          }
          return out;
        });
        if (sets.length === 0) sets.push({ setNumber: 1, reps: 10, weightKg: 0 });

        seenIds.add(lib.id);
        exercises.push({ name: lib.name, exerciseId: lib.id, muscleGroups: mapped.muscleGroups, sets });
        totalExercises += 1;
      }

      if (exercises.length > 0) {
        days.push({
          dayNumber: clampInt(d.dayNumber, 1, MAX_DAYS_PER_WEEK, di + 1),
          focus: typeof d.focus === "string" && d.focus.trim() ? d.focus.trim().slice(0, 80) : `Day ${di + 1}`,
          exercises,
        });
      }
    });

    if (days.length > 0) {
      weeks.push({ weekNumber: clampInt(w.weekNumber, 1, MAX_WEEKS, wi + 1), days });
    }
  });

  if (weeks.length === 0 || totalExercises === 0) {
    throw new PlanValidationError("No valid exercises after filtering");
  }

  return {
    planName: p.planName.trim().slice(0, 100),
    goal: typeof p.goal === "string" ? p.goal.trim().slice(0, 80) : "",
    durationWeeks: weeks.length,
    weeks,
    ...(typeof p.notes === "string" && p.notes.trim()
      ? { notes: p.notes.trim().slice(0, 1000) }
      : {}),
  };
}
