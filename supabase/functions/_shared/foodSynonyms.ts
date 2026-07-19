// British → American food-term synonyms, applied before USDA FoodData Central
// lookups. USDA is US English ("beets", "zucchini"); UK users type British
// terms ("beetroot", "courgette"), which return nothing useful from USDA's
// whole-food data types. Whole-word, case-insensitive replacement; the term is
// left unchanged when nothing matches.
const BRITISH_TO_AMERICAN: [RegExp, string][] = [
  [/\bbeetroot\b/gi, "beets"],
  [/\bcourgettes?\b/gi, "zucchini"],
  [/\baubergines?\b/gi, "eggplant"],
  [/\bcoriander\b/gi, "cilantro"],
  [/\brocket\b/gi, "arugula"],
  [/\bprawns?\b/gi, "shrimp"],
  [/\bmange\s*tout\b/gi, "snow peas"],
  [/\bswede\b/gi, "rutabaga"],
  [/\bspring onions?\b/gi, "green onion"],
];

export function britishToAmerican(query: string): string {
  let out = query;
  for (const [re, replacement] of BRITISH_TO_AMERICAN) {
    out = out.replace(re, replacement);
  }
  return out;
}
