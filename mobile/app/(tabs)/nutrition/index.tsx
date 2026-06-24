import { useState, useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TabSafeArea } from "@/components/TabSafeArea";
import { router } from "expo-router";
import {
  useNutritionLogs,
  useDeleteNutritionLog,
  useDaySummary,
  useLogWater,
  useLogFood,
  useRecentFoods,
} from "@/hooks/useNutrition";
import { usePremium } from "@/hooks/usePremium";
import { historyCutoffDate } from "@/lib/premium";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import { MEAL_TYPES, type MealType } from "@/constants";
import { todayLocal, shiftDateLocal, formatDateLabel } from "@/lib/dates";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { SwipeToDeleteRow } from "@/components/SwipeToDeleteRow";
import { isPendingLogId } from "@/lib/offlineNutrition";
import { AiFoodLogActions } from "@/components/AiFoodLogActions";
import { MEAL_COLORS } from "@/lib/mealColors";
import { MealDot } from "@/components/ui/IconButton";
import { Card } from "@/components/ui/Card";
import { colors } from "@/lib/theme";

function MealSection({
  mealType,
  logs,
  onDelete,
  onAdd,
}: {
  mealType: MealType;
  logs: ReturnType<typeof useNutritionLogs>["data"];
  onDelete: (id: string) => void;
  onAdd: (mealType: MealType) => void;
}) {
  const items = (logs ?? []).filter((l) => l.meal_type === mealType);
  const mealCalories = items.reduce((sum, l) => sum + l.calories, 0);

  return (
    <View className="mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <MealDot color={MEAL_COLORS[mealType]} />
          <Text className="text-white font-semibold capitalize">{mealType}</Text>
          {mealCalories > 0 && (
            <Text className="text-slate-500 text-sm">{Math.round(mealCalories)} kcal</Text>
          )}
        </View>
        <TouchableOpacity
          className="bg-brand-500/12 border border-brand-500/20 rounded-lg px-3 py-1.5"
          onPress={() => onAdd(mealType)}
        >
          <Text className="text-brand-400 text-sm font-medium">Add</Text>
        </TouchableOpacity>
      </View>

      {items.map((log) => {
        const name = log.food_name ?? log.food?.name ?? "Unknown food";
        return (
          <SwipeToDeleteRow key={log.id} title={name} onDelete={() => onDelete(log.id)}>
            <View className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-white text-sm font-medium">{name}</Text>
                  {isPendingLogId(log.id) ? (
                    <Text className="text-amber-400 text-[10px] font-semibold">SYNCING</Text>
                  ) : null}
                </View>
                <Text className="text-slate-500 text-xs mt-0.5">
                  {log.servings} × {log.food?.serving_label ?? "serving"} ·{" "}
                  {log.protein_g.toFixed(1)}p {log.carbs_g.toFixed(1)}c {log.fat_g.toFixed(1)}f
                </Text>
              </View>
              <Text className="text-white font-semibold ml-3">{Math.round(log.calories)}</Text>
            </View>
          </SwipeToDeleteRow>
        );
      })}

      {items.length === 0 && (
        <View className="bg-surface-card border border-surface-border rounded-xl px-4 py-3">
          <Text className="text-slate-500 text-sm">Nothing logged yet</Text>
        </View>
      )}
    </View>
  );
}

export default function NutritionScreen() {
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const today = todayLocal();
  const refreshKeys = useMemo(
    () => [["nutrition", selectedDate], ["water", selectedDate]],
    [selectedDate]
  );
  const { refreshing, onRefresh } = useScreenRefresh(refreshKeys);
  useRefetchOnFocus(refreshKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: logs } = useNutritionLogs(selectedDate);
  const { data: recentFoods = [] } = useRecentFoods();
  const logFood = useLogFood();
  const deleteLog = useDeleteNutritionLog();
  const logWater = useLogWater();
  const { isPremium, profile } = usePremium();
  const { calories, protein_g, carbs_g, fat_g, water_ml } = useDaySummary(selectedDate);
  const historyCutoff = historyCutoffDate(profile);

  function shiftDate(days: number) {
    const next = shiftDateLocal(selectedDate, days);
    if (!isPremium && next < historyCutoff) {
      Alert.alert(
        "History limit",
        "Free accounts can view 30 days of history. Upgrade for full access.",
        [
          { text: "OK", style: "cancel" },
          { text: "Upgrade", onPress: navigateToPaywall },
        ]
      );
      return;
    }
    setSelectedDate(next);
  }

  function handleAddFood(mealType: MealType) {
    router.push({ pathname: "/(tabs)/nutrition/log", params: { mealType, date: selectedDate } });
  }

  function handleDelete(id: string) {
    deleteLog.mutate({ id, date: selectedDate });
  }

  return (
    <TabSafeArea>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-white text-2xl font-bold tracking-tight">Nutrition</Text>
      </View>

      <View className="flex-row items-center justify-between px-5 pb-4">
        <TouchableOpacity className="p-2" onPress={() => shiftDate(-1)}>
          <Ionicons name="chevron-back" size={20} color={colors.brand[400]} />
        </TouchableOpacity>
        <Text className="text-white font-semibold text-sm">{formatDateLabel(selectedDate)}</Text>
        <TouchableOpacity className="p-2" onPress={() => shiftDate(1)} disabled={selectedDate >= today}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={selectedDate >= today ? colors.text.muted : colors.brand[400]}
          />
        </TouchableOpacity>
      </View>

      <AiFoodLogActions date={selectedDate} />

      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
      >
        <Card className="mb-5">
          <View className="flex-row justify-between">
            {[
              { label: "Calories", value: Math.round(calories) },
              { label: "Protein", value: `${Math.round(protein_g)}g` },
              { label: "Carbs", value: `${Math.round(carbs_g)}g` },
              { label: "Fat", value: `${Math.round(fat_g)}g` },
            ].map((stat) => (
              <View key={stat.label} className="items-center flex-1">
                <Text className="text-white text-xl font-bold">{stat.value}</Text>
                <Text className="text-slate-400 text-xs mt-0.5">{stat.label}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row items-center justify-between pt-4 mt-4 border-t border-surface-border">
            <View className="flex-row items-center gap-2">
              <Ionicons name="water-outline" size={16} color={colors.info} />
              <Text className="text-slate-400 text-sm">
                {Math.round(water_ml / 100) / 10}L water
              </Text>
            </View>
            <View className="flex-row gap-2">
              {[250, 500].map((ml) => (
                <TouchableOpacity
                  key={ml}
                  className="bg-surface-elevated rounded-lg px-3 py-1.5"
                  onPress={() => logWater.mutate({ date: selectedDate, amount_ml: ml })}
                >
                  <Text className="text-slate-300 text-xs font-medium">+{ml}ml</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Card>

        {recentFoods.length > 0 && selectedDate === today ? (
          <View className="mb-5">
            <Text className="text-white font-semibold text-sm mb-2">Recent foods</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {recentFoods.map((food) => (
                <TouchableOpacity
                  key={`${food.food_name}-${food.food_id ?? ""}`}
                  className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 mr-2 min-w-[120]"
                  onPress={() =>
                    logFood.mutate({
                      food_id: food.food_id,
                      food_name: food.food_name,
                      meal_type: food.meal_type,
                      date: selectedDate,
                      servings: food.servings,
                      calories: food.calories,
                      protein_g: food.protein_g,
                      carbs_g: food.carbs_g,
                      fat_g: food.fat_g,
                      log_method: "manual",
                      notes: null,
                    })
                  }
                >
                  <Text className="text-white text-sm font-medium" numberOfLines={1}>
                    {food.food_name}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-0.5">
                    {Math.round(food.calories)} kcal
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {MEAL_TYPES.map((mealType) => (
          <MealSection
            key={mealType}
            mealType={mealType}
            logs={logs}
            onDelete={handleDelete}
            onAdd={handleAddFood}
          />
        ))}

        <View className="h-8" />
      </ScrollView>
    </TabSafeArea>
  );
}
