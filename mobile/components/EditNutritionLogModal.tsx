import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { AppTextInput } from "@/components/AppTextInput";
import { AnimatedKeyboardAvoidingView } from "@/components/AnimatedKeyboardAvoidingView";
import { MEAL_TYPES, type MealType } from "@/constants";
import { MEAL_COLORS } from "@/lib/mealColors";
import { MealDot } from "@/components/ui/IconButton";
import type { NutritionLog } from "@/types";

type EditableFields = {
  food_name: string;
  meal_type: MealType;
  servings: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  notes: string;
};

function toFields(log: NutritionLog): EditableFields {
  return {
    food_name: log.food_name ?? log.food?.name ?? "",
    meal_type: log.meal_type,
    servings: String(log.servings),
    calories: String(Math.round(log.calories)),
    protein_g: String(log.protein_g),
    carbs_g: String(log.carbs_g),
    fat_g: String(log.fat_g),
    notes: log.notes ?? "",
  };
}

type EditNutritionLogModalProps = {
  log: NutritionLog | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (updates: {
    food_name: string;
    meal_type: MealType;
    servings: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    notes: string | null;
  }) => void;
};

export function EditNutritionLogModal({ log, saving = false, onClose, onSave }: EditNutritionLogModalProps) {
  const [fields, setFields] = useState<EditableFields | null>(null);

  useEffect(() => {
    setFields(log ? toFields(log) : null);
  }, [log]);

  if (!log || !fields) return null;

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!fields) return;
    onSave({
      food_name: fields.food_name.trim() || "Unknown food",
      meal_type: fields.meal_type,
      servings: Math.max(0, Number(fields.servings) || 0),
      calories: Math.max(0, Number(fields.calories) || 0),
      protein_g: Math.max(0, Number(fields.protein_g) || 0),
      carbs_g: Math.max(0, Number(fields.carbs_g) || 0),
      fat_g: Math.max(0, Number(fields.fat_g) || 0),
      notes: fields.notes.trim() || null,
    });
  }

  return (
    <Modal visible={!!log} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/60 justify-end" activeOpacity={1} onPress={onClose}>
        <AnimatedKeyboardAvoidingView enabled={!!log}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View className="bg-surface-card rounded-t-3xl p-5 border-t border-surface-elevated max-h-[85%]">
              <Text className="text-white text-lg font-bold mb-4">Edit food log</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text className="text-slate-400 text-xs mb-1.5">Name</Text>
                <AppTextInput
                  className="bg-surface-elevated text-white rounded-xl mb-4"
                  value={fields.food_name}
                  onChangeText={(v) => update("food_name", v)}
                  placeholder="Food name"
                />

                <Text className="text-slate-400 text-xs mb-1.5">Meal</Text>
                <View className="flex-row gap-2 mb-4">
                  {MEAL_TYPES.map((mealType) => {
                    const active = fields.meal_type === mealType;
                    return (
                      <TouchableOpacity
                        key={mealType}
                        className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 border ${
                          active ? "bg-brand-500/15 border-brand-500/40" : "bg-surface-elevated border-surface-border"
                        }`}
                        onPress={() => update("meal_type", mealType)}
                      >
                        <MealDot color={MEAL_COLORS[mealType]} />
                        <Text
                          className={`text-xs font-medium capitalize ${active ? "text-brand-400" : "text-slate-400"}`}
                        >
                          {mealType}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-slate-400 text-xs mb-1.5">Servings</Text>
                    <AppTextInput
                      className="bg-surface-elevated text-white rounded-xl"
                      keyboardType="decimal-pad"
                      value={fields.servings}
                      onChangeText={(v) => update("servings", v)}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-400 text-xs mb-1.5">Calories</Text>
                    <AppTextInput
                      className="bg-surface-elevated text-white rounded-xl"
                      keyboardType="decimal-pad"
                      value={fields.calories}
                      onChangeText={(v) => update("calories", v)}
                    />
                  </View>
                </View>

                <Text className="text-slate-400 text-xs mb-1.5">Macros (g)</Text>
                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-slate-500 text-[11px] mb-1">Protein</Text>
                    <AppTextInput
                      className="bg-surface-elevated text-white rounded-xl"
                      keyboardType="decimal-pad"
                      value={fields.protein_g}
                      onChangeText={(v) => update("protein_g", v)}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-500 text-[11px] mb-1">Carbs</Text>
                    <AppTextInput
                      className="bg-surface-elevated text-white rounded-xl"
                      keyboardType="decimal-pad"
                      value={fields.carbs_g}
                      onChangeText={(v) => update("carbs_g", v)}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-500 text-[11px] mb-1">Fat</Text>
                    <AppTextInput
                      className="bg-surface-elevated text-white rounded-xl"
                      keyboardType="decimal-pad"
                      value={fields.fat_g}
                      onChangeText={(v) => update("fat_g", v)}
                    />
                  </View>
                </View>

                <Text className="text-slate-400 text-xs mb-1.5">Notes</Text>
                <AppTextInput
                  className="bg-surface-elevated text-white rounded-xl mb-5"
                  value={fields.notes}
                  onChangeText={(v) => update("notes", v)}
                  placeholder="Optional notes"
                  multiline
                />
              </ScrollView>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 bg-surface-elevated rounded-xl py-3 items-center"
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text className="text-slate-300 font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-brand-500 rounded-xl py-3 items-center"
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold">Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </AnimatedKeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
