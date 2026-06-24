const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bdb\b/gi, "dumbbell"],
  [/\bbb\b/gi, "barbell"],
  [/\bohp\b/gi, "overhead press"],
  [/\brdl\b/gi, "romanian deadlift"],
  [/\bsldl\b/gi, "stiff leg deadlift"],
  [/\bcgbp\b/gi, "close grip bench press"],
  [/\blat\s*pd\b/gi, "lat pulldown"],
];

export function expandExerciseSearchQuery(query: string): string {
  let expanded = query.trim();
  for (const [pattern, replacement] of ABBREVIATIONS) {
    expanded = expanded.replace(pattern, replacement);
  }
  return expanded.replace(/\s+/g, " ").trim();
}

export function hasExactExerciseMatch(
  query: string,
  results: Array<{ name: string }>
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return results.some((exercise) => exercise.name.trim().toLowerCase() === normalized);
}
