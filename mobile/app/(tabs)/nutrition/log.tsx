import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useFoodSearch, useLogFood } from "@/hooks/useNutrition";
import type { Food } from "@/types";
import type { MealType } from "@/constants";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { AppTextInput } from "@/components/AppTextInput";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { AnimatedKeyboardAvoidingView } from "@/components/AnimatedKeyboardAvoidingView";
import { colors } from "@/lib/theme";

export default function LogFoodScreen() {
  const { mealType, date } = useLocalSearchParams<{ mealType: MealType; date: string }>();
  const [query, setQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servings, setServings] = useState("1");

  const refreshKeys = useMemo(() => [["food-search"]] as const, []);
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);

  const { data: results = [], isFetching, isDebouncing } = useFoodSearch(query);
  const logFood = useLogFood();

  async function handleLog() {
    if (!selectedFood) return;
    const servingCount = parseFloat(servings);
    if (isNaN(servingCount) || servingCount <= 0) {
      Alert.alert("Error", "Enter a valid serving amount.");
      return;
    }

    try {
      await logFood.mutateAsync({
        food_id: selectedFood.id,
        food_name: selectedFood.name,
        meal_type: mealType ?? "snack",
        date: date ?? new Date().toISOString().split("T")[0],
        servings: servingCount,
        calories: selectedFood.calories_per_serving * servingCount,
        protein_g: selectedFood.protein_g * servingCount,
        carbs_g: selectedFood.carbs_g * servingCount,
        fat_g: selectedFood.fat_g * servingCount,
        log_method: "manual",
        notes: null,
      });
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message ?? "Could not log food.");
    }
  }

  return (
    <SwipeBackGesture>
    <SafeAreaView className="flex-1 bg-surface">
      <AnimatedKeyboardAvoidingView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-brand-400 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold capitalize flex-1">
            Log {mealType}
          </Text>
        </View>

        {/* Search */}
        <View className="px-5 mb-4">
          <AppTextInput
            placeholder="Search foods…"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.trim().length > 1 && (isDebouncing || isFetching) && (
            <Text className="text-slate-400 text-xs mt-2 px-1">
              Searching local + global food catalog...
            </Text>
          )}
        </View>

        {/* Selected food details */}
        {selectedFood && (
          <View className="mx-5 mb-4 bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4">
            <Text className="text-white font-semibold mb-1">{selectedFood.name}</Text>
            {selectedFood.brand && (
              <Text className="text-slate-400 text-sm mb-2">{selectedFood.brand}</Text>
            )}
            <View className="flex-row gap-3 mb-3">
              <Text className="text-slate-300 text-sm">
                {Math.round(selectedFood.calories_per_serving)} kcal ·{" "}
                {selectedFood.protein_g}g P · {selectedFood.carbs_g}g C · {selectedFood.fat_g}g F
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Text className="text-slate-400 text-sm">Servings:</Text>
              <AppTextInput
                className="bg-surface-elevated text-white rounded-lg w-20 text-center"
                variant="compact"
                value={servings}
                onChangeText={setServings}
                keyboardType="decimal-pad"
              />
              <Text className="text-slate-400 text-sm">× {selectedFood.serving_label}</Text>
            </View>
            <TouchableOpacity
              className="bg-brand-500 rounded-xl py-3.5 items-center mt-3"
              onPress={handleLog}
              disabled={logFood.isPending}
            >
              <Text className="text-white font-semibold">
                {logFood.isPending ? "Logging…" : "Log Food"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-8"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className={`rounded-xl px-4 py-3 mb-1.5 ${
                selectedFood?.id === item.id ? "bg-brand-500/20" : "bg-surface-card"
              }`}
              onPress={() => setSelectedFood(item)}
            >
              <Text className="text-white font-medium">{item.name}</Text>
              {item.brand && (
                <Text className="text-slate-500 text-xs">{item.brand}</Text>
              )}
              <Text className="text-slate-400 text-sm mt-0.5">
                {Math.round(item.calories_per_serving)} kcal · {item.serving_label}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length > 1 ? (
              <View className="py-8 items-center">
                <Text className="text-slate-400">
                  {isDebouncing || isFetching ? "Searching..." : "No results found"}
                </Text>
              </View>
            ) : null
          }
        />
      </AnimatedKeyboardAvoidingView>
    </SafeAreaView>
    </SwipeBackGesture>
  );
}
