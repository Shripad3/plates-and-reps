import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { AppTextInput } from "@/components/AppTextInput";
import { Button } from "@/components/ui/Button";
import { DIET_PATTERNS, ALLERGENS, MEDICAL_CONDITIONS } from "@/constants";
import { colors } from "@/lib/theme";
import type { DietInfo } from "@/lib/mealPlan";

const labelize = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Chip({ label, active, onPress, danger }: { label: string; active: boolean; onPress: () => void; danger?: boolean }) {
  const activeBg = danger ? "bg-red-500 border-red-500" : "bg-brand-500 border-brand-500";
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-full px-3.5 py-2 mr-2 mb-2 border ${active ? activeBg : "bg-surface-card border-surface-border"}`}
    >
      <Text className={`text-sm ${active ? "text-white font-medium" : "text-slate-300"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DietForm({
  initial,
  onSubmit,
  onSkip,
  submitting = false,
  saveLabel = "Save",
}: {
  initial?: DietInfo | null;
  onSubmit: (info: DietInfo) => void;
  onSkip: () => void;
  submitting?: boolean;
  saveLabel?: string;
}) {
  const [pattern, setPattern] = useState<string>(initial?.pattern ?? "omnivore");
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [conditions, setConditions] = useState<string[]>(initial?.medicalConditions ?? []);
  const [mealsPerDay, setMealsPerDay] = useState<number>(initial?.mealsPerDay ?? 3);
  const [dislikes, setDislikes] = useState(initial?.dislikes?.join(", ") ?? "");
  const [cuisines, setCuisines] = useState(initial?.cuisines?.join(", ") ?? "");

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const splitCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);

  function handleSave() {
    onSubmit({
      status: "provided",
      pattern,
      allergies,
      medicalConditions: conditions,
      mealsPerDay,
      dislikes: splitCsv(dislikes),
      cuisines: splitCsv(cuisines),
      // Filling the form confirms the current allergy set.
      allergiesConfirmedAt: new Date().toISOString(),
    });
  }

  return (
    <View>
      <Text className="text-slate-400 text-sm mb-2">Dietary pattern</Text>
      <View className="flex-row flex-wrap mb-4">
        {DIET_PATTERNS.map((p) => (
          <Chip key={p.value} label={p.label} active={pattern === p.value} onPress={() => setPattern(p.value)} />
        ))}
      </View>

      <Text className="text-white text-sm font-semibold mb-1">Allergies & intolerances</Text>
      <Text className="text-slate-500 text-xs mb-2">Safety-critical — we never include these.</Text>
      <View className="flex-row flex-wrap mb-4">
        {ALLERGENS.map((a) => (
          <Chip key={a} label={labelize(a)} active={allergies.includes(a)} danger onPress={() => toggle(allergies, setAllergies, a)} />
        ))}
      </View>

      <Text className="text-slate-400 text-sm mb-2">Any of these conditions?</Text>
      <View className="flex-row flex-wrap mb-1">
        {MEDICAL_CONDITIONS.map((c) => (
          <Chip key={c} label={labelize(c)} active={conditions.includes(c)} onPress={() => toggle(conditions, setConditions, c)} />
        ))}
      </View>
      <Text className="text-slate-500 text-xs mb-4">
        If selected, we'll point you to a professional instead of auto-generating.
      </Text>

      <Text className="text-slate-400 text-sm mb-2">Meals per day</Text>
      <View className="flex-row flex-wrap mb-4">
        {[2, 3, 4, 5].map((n) => (
          <Chip key={n} label={`${n}`} active={mealsPerDay === n} onPress={() => setMealsPerDay(n)} />
        ))}
      </View>

      <Text className="text-slate-400 text-sm mb-1.5">Foods to avoid (optional)</Text>
      <View className="mb-4">
        <AppTextInput placeholder="e.g. mushrooms, cilantro" placeholderTextColor={colors.text.muted} value={dislikes} onChangeText={setDislikes} />
      </View>

      <Text className="text-slate-400 text-sm mb-1.5">Preferred cuisines (optional)</Text>
      <AppTextInput placeholder="e.g. Indian, Mediterranean" placeholderTextColor={colors.text.muted} value={cuisines} onChangeText={setCuisines} />

      <View className="mt-5 gap-2">
        <Button label={saveLabel} onPress={handleSave} loading={submitting} fullWidth />
        <TouchableOpacity className="py-3 items-center" onPress={onSkip} disabled={submitting}>
          <Text className="text-slate-400 text-sm">Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
