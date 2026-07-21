// Deterministic training-analysis engine.
//
// All the FACTS about a workout are computed here from structured data — muscle
// coverage, per-muscle volume, push/pull & upper/lower balance, goal rep-range
// fit, injury/safety cross-referencing, and (from 2-4 weeks of logged history)
// per-exercise progression. These roll up into sub-scores and one main score.
// The LLM never invents any of this; it only narrates the output.
//
// Muscle attribution note: exercises store a flat `muscle_groups` array with no
// primary/secondary distinction (wger import), so each working set is counted
// toward every listed group. This slightly inflates compound volume but keeps
// the balance/coverage story honest. Exercises with an empty muscle array are
// counted as "unclassified" and excluded from coverage.

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms"
  | "core" | "quads" | "hamstrings" | "glutes" | "calves" | "full_body" | "cardio";

/** Goals we map rep-range / compound expectations against. */
export type AnalysisGoal = "build_muscle" | "lose_fat" | "strength" | "general_fitness";

export interface AnalysisExercise {
  exercise_id: string;
  name: string;
  muscle_groups: string[];
  equipment: string[];
  category: string; // "strength" | "cardio"
  sets: number;             // number of working sets in the routine
  target_reps: number | null;
}

export interface ExerciseHistoryPoint {
  date: string;       // ISO
  top_weight_kg: number | null;
  top_reps: number | null;
  total_volume: number; // sum(reps*weight) for the session
}

export interface AnalysisInput {
  exercises: AnalysisExercise[];
  goal: AnalysisGoal;
  injuries: string[]; // canonical injury areas: knee, lower_back, shoulder, elbow, wrist, hip, ankle, neck
  /** exercise_id -> chronological session points (oldest→newest), last 2-4 weeks. */
  history: Record<string, ExerciseHistoryPoint[]>;
}

// ---- Classification tables -------------------------------------------------

const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
const PULL: MuscleGroup[] = ["back", "biceps", "forearms"];
const UPPER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "forearms"];
const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];

/** Muscle groups that render on the body map (full_body/cardio don't map to a region). */
export const MAPPABLE_MUSCLES: MuscleGroup[] = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "core", "quads", "hamstrings", "glutes", "calves",
];

/** Which injury areas conflict with which muscle groups (heavy loading risk). */
const INJURY_CONFLICTS: Record<string, MuscleGroup[]> = {
  knee: ["quads", "hamstrings", "glutes", "calves"],
  lower_back: ["back", "hamstrings", "glutes"],
  hip: ["glutes", "hamstrings", "quads"],
  shoulder: ["chest", "shoulders", "triceps"],
  elbow: ["biceps", "triceps", "forearms"],
  wrist: ["forearms", "biceps"],
  ankle: ["calves"],
  neck: ["shoulders", "back"],
};

const GOAL_REP_RANGE: Record<AnalysisGoal, [number, number]> = {
  strength: [1, 6],
  build_muscle: [6, 15],
  lose_fat: [10, 20],
  general_fitness: [8, 15],
};

// Per-SESSION direct-set guidance for a single muscle group (not weekly volume).
const SESSION_SET_MIN_STIMULUS = 3; // below this = only a light/secondary hit
const SESSION_SET_HIGH = 12;        // above this in one session risks junk volume

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ---- Output shape ----------------------------------------------------------

export interface WorkoutAnalysis {
  exerciseCount: number;
  totalWorkingSets: number;
  unclassifiedExercises: string[];
  estDurationMin: number;
  muscleVolume: Record<string, number>;      // sets per muscle group
  bodyMapIntensity: Record<string, number>;  // muscle -> 0..5 (for heatmap)
  coverage: { trained: string[]; missing: string[] };
  balance: {
    pushSets: number; pullSets: number; upperSets: number; lowerSets: number; coreSets: number;
    pushPull: number | null;   // ratio push/pull
    upperLower: number | null; // ratio upper/lower
    flags: string[];
  };
  goalFit: {
    goal: AnalysisGoal;
    repRange: [number, number];
    inRangeSets: number;
    outOfRangeSets: number;
    compoundRatio: number; // 0..1
  };
  safety: { flags: { injury: string; exercises: string[] }[] };
  progression: {
    exercise_id: string; name: string;
    trend: "up" | "flat" | "down" | "insufficient";
    detail: string;
  }[];
  subScores: { balance: number; volume: number; goalFit: number; safety: number | null; progression: number | null };
  score: number; // 0..100
}

// ---- Engine ----------------------------------------------------------------

function intensityFromSets(sets: number): number {
  if (sets <= 0) return 0;
  if (sets <= 2) return 1;
  if (sets <= 4) return 2;
  if (sets <= 6) return 3;
  if (sets <= 9) return 4;
  return 5;
}

function sumSets(volume: Record<string, number>, groups: MuscleGroup[]): number {
  return groups.reduce((acc, g) => acc + (volume[g] ?? 0), 0);
}

export function analyzeWorkout(input: AnalysisInput): WorkoutAnalysis {
  const { exercises, goal, injuries, history } = input;

  const muscleVolume: Record<string, number> = {};
  const unclassifiedExercises: string[] = [];
  let totalWorkingSets = 0;
  let compoundCount = 0;
  let inRangeSets = 0;
  let outOfRangeSets = 0;
  const [repLo, repHi] = GOAL_REP_RANGE[goal];

  for (const ex of exercises) {
    const sets = Math.max(0, ex.sets || 0);
    totalWorkingSets += sets;
    const groups = (ex.muscle_groups ?? []).filter((g) =>
      MAPPABLE_MUSCLES.includes(g as MuscleGroup) || g === "full_body" || g === "cardio"
    );
    if (groups.length === 0) unclassifiedExercises.push(ex.name);
    for (const g of groups) muscleVolume[g] = (muscleVolume[g] ?? 0) + sets;

    // Compound if it targets 2+ mappable muscle groups.
    const mappable = groups.filter((g) => MAPPABLE_MUSCLES.includes(g as MuscleGroup));
    if (mappable.length >= 2) compoundCount += 1;

    if (ex.target_reps != null) {
      if (ex.target_reps >= repLo && ex.target_reps <= repHi) inRangeSets += sets;
      else outOfRangeSets += sets;
    }
  }

  // Body-map intensities (only mappable muscles).
  const bodyMapIntensity: Record<string, number> = {};
  for (const m of MAPPABLE_MUSCLES) bodyMapIntensity[m] = intensityFromSets(muscleVolume[m] ?? 0);

  const trained = MAPPABLE_MUSCLES.filter((m) => (muscleVolume[m] ?? 0) > 0);
  const missing = MAPPABLE_MUSCLES.filter((m) => (muscleVolume[m] ?? 0) === 0);

  // ---- Balance ----
  const pushSets = sumSets(muscleVolume, PUSH);
  const pullSets = sumSets(muscleVolume, PULL);
  const upperSets = sumSets(muscleVolume, UPPER);
  const lowerSets = sumSets(muscleVolume, LOWER);
  const coreSets = muscleVolume["core"] ?? 0;
  const pushPull = pullSets > 0 ? round1(pushSets / pullSets) : (pushSets > 0 ? null : null);
  const upperLower = lowerSets > 0 ? round1(upperSets / lowerSets) : (upperSets > 0 ? null : null);

  const balanceFlags: string[] = [];
  if (pushSets > 0 && pullSets === 0) balanceFlags.push("All pushing, no pulling — add a row or pulldown.");
  else if (pushPull != null && (pushPull >= 2 || pushPull <= 0.5)) {
    balanceFlags.push(pushPull >= 2 ? "Push volume far exceeds pull." : "Pull volume far exceeds push.");
  }
  const quads = muscleVolume["quads"] ?? 0;
  const hams = muscleVolume["hamstrings"] ?? 0;
  if (quads > 0 && hams === 0) balanceFlags.push("Quad work with no hamstring/posterior-chain work.");

  // ---- Sub-scores (0..100) ----
  // Balance: penalize push/pull and upper/lower deviation from ~1:1 and flags.
  let balanceScore = 100;
  if (pushPull != null) balanceScore -= Math.min(40, Math.abs(Math.log2(pushPull)) * 30);
  else if (pushSets > 0 || pullSets > 0) balanceScore -= 25; // only one side present
  if (upperLower != null) balanceScore -= Math.min(25, Math.abs(Math.log2(upperLower)) * 12);
  balanceScore -= balanceFlags.length * 8;
  balanceScore = clamp(balanceScore);

  // Volume: reward muscles landing in a productive per-session set range; penalize
  // too-few total sets or grossly over-volumed single muscles.
  const productiveMuscles = trained.filter((m) => {
    const s = muscleVolume[m] ?? 0;
    return s >= SESSION_SET_MIN_STIMULUS && s <= SESSION_SET_HIGH;
  }).length;
  const overVolumed = trained.filter((m) => (muscleVolume[m] ?? 0) > SESSION_SET_HIGH).length;
  let volumeScore = 100;
  if (trained.length > 0) volumeScore = (productiveMuscles / trained.length) * 100;
  if (totalWorkingSets < 8) volumeScore -= 20;     // very short session
  if (totalWorkingSets > 40) volumeScore -= 15;    // likely too long
  volumeScore -= overVolumed * 8;
  volumeScore = clamp(volumeScore);

  // Goal-fit: how much of the prescribed volume lands in the goal rep range,
  // plus an appropriate compound ratio.
  const totalRepScored = inRangeSets + outOfRangeSets;
  const compoundRatio = exercises.length > 0 ? round1(compoundCount / exercises.length) : 0;
  let goalFitScore = totalRepScored > 0 ? (inRangeSets / totalRepScored) * 100 : 70;
  // Strength/muscle building want compound-led sessions; nudge if too isolation-heavy.
  if ((goal === "strength" || goal === "build_muscle") && compoundRatio < 0.4) goalFitScore -= 15;
  goalFitScore = clamp(goalFitScore);

  // ---- Safety ----
  const safetyFlags: { injury: string; exercises: string[] }[] = [];
  for (const injury of injuries ?? []) {
    const conflictGroups = INJURY_CONFLICTS[injury];
    if (!conflictGroups) continue;
    const hits = exercises
      .filter((ex) => (ex.muscle_groups ?? []).some((g) => conflictGroups.includes(g as MuscleGroup)))
      .map((ex) => ex.name);
    if (hits.length > 0) safetyFlags.push({ injury, exercises: hits });
  }
  const hasInjuries = (injuries ?? []).length > 0;
  let safetyScore: number | null = null;
  if (hasInjuries) {
    safetyScore = clamp(100 - safetyFlags.reduce((acc, f) => acc + Math.min(3, f.exercises.length) * 12, 0));
  }

  // ---- Progression (from 2-4 weeks of history) ----
  const progression: WorkoutAnalysis["progression"] = [];
  let progUp = 0, progTracked = 0;
  for (const ex of exercises) {
    const pts = (history[ex.exercise_id] ?? []).filter((p) => p.total_volume > 0);
    if (pts.length < 2) {
      progression.push({ exercise_id: ex.exercise_id, name: ex.name, trend: "insufficient", detail: "Not enough logged sessions yet." });
      continue;
    }
    progTracked += 1;
    const first = pts[0].total_volume;
    const last = pts[pts.length - 1].total_volume;
    const change = first > 0 ? (last - first) / first : 0;
    let trend: "up" | "flat" | "down";
    if (change > 0.05) { trend = "up"; progUp += 1; }
    else if (change < -0.05) trend = "down";
    else trend = "flat";
    const pct = Math.round(change * 100);
    progression.push({
      exercise_id: ex.exercise_id,
      name: ex.name,
      trend,
      detail: trend === "flat"
        ? "Volume roughly flat over the period."
        : `Session volume ${pct > 0 ? "+" : ""}${pct}% across recent sessions.`,
    });
  }
  const progressionScore: number | null = progTracked > 0 ? clamp((progUp / progTracked) * 100) : null;

  // ---- Main score: weighted rollup of available sub-scores ----
  const weighted: [number, number][] = [
    [balanceScore, 25],
    [volumeScore, 25],
    [goalFitScore, 25],
  ];
  if (safetyScore != null) weighted.push([safetyScore, 15]);
  if (progressionScore != null) weighted.push([progressionScore, 10]);
  const totalWeight = weighted.reduce((a, [, w]) => a + w, 0);
  const score = Math.round(weighted.reduce((a, [s, w]) => a + s * w, 0) / totalWeight);

  // Rough duration: ~2.5 min per working set + ~1 min setup per exercise.
  const estDurationMin = Math.round(totalWorkingSets * 2.5 + exercises.length);

  return {
    exerciseCount: exercises.length,
    totalWorkingSets,
    unclassifiedExercises,
    estDurationMin,
    muscleVolume,
    bodyMapIntensity,
    coverage: { trained, missing },
    balance: { pushSets, pullSets, upperSets, lowerSets, coreSets, pushPull, upperLower, flags: balanceFlags },
    goalFit: { goal, repRange: [repLo, repHi], inRangeSets, outOfRangeSets, compoundRatio },
    safety: { flags: safetyFlags },
    progression,
    subScores: {
      balance: Math.round(balanceScore),
      volume: Math.round(volumeScore),
      goalFit: Math.round(goalFitScore),
      safety: safetyScore != null ? Math.round(safetyScore) : null,
      progression: progressionScore != null ? Math.round(progressionScore) : null,
    },
    score,
  };
}
