import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, View, Text, TouchableOpacity, RefreshControl, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TabSafeArea } from "@/components/TabSafeArea";
import { router, type Href } from "expo-router";
import {
  useNutritionLogs,
  useDeleteNutritionLog,
  useUpdateNutritionLog,
  useDaySummary,
  useLogFood,
  useRecentFoods,
} from "@/hooks/useNutrition";
import { getGoal } from "@/lib/api";
import { usePremium } from "@/hooks/usePremium";
import { historyCutoffDate } from "@/lib/premium";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import { MEAL_TYPES, type MealType } from "@/constants";
import { todayLocal, shiftDateLocal, formatDateLabel } from "@/lib/dates";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { EmptyState } from "@/components/EmptyState";
import { SwipeToDeleteRow } from "@/components/SwipeToDeleteRow";
import { isPendingLogId } from "@/lib/offlineNutrition";
import { AiFoodLogActions } from "@/components/AiFoodLogActions";
import { EditNutritionLogModal } from "@/components/EditNutritionLogModal";
import { MEAL_COLORS } from "@/lib/mealColors";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WaterWidget } from "@/components/WaterWidget";
import { colors, radii } from "@/lib/theme";
import type { NutritionLog } from "@/types";

function MealSection({
  mealType,
  logs,
  onDelete,
  onAdd,
  onEdit,
  isFirst,
}: {
  mealType: MealType;
  logs: ReturnType<typeof useNutritionLogs>["data"];
  onDelete: (id: string) => void;
  onAdd: (mealType: MealType) => void;
  onEdit: (log: NutritionLog) => void;
  isFirst: boolean;
}) {
  const items = (logs ?? []).filter((l) => l.meal_type === mealType);
  const mealCalories = items.reduce((sum, l) => sum + l.calories, 0);
  const isEmpty = items.length === 0;

  return (
    <View>
      {!isFirst && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border }} />
      )}

      {/* Header row — fixed 44pt */}
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 }}>
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MEAL_COLORS[mealType], marginRight: 10 }}
        />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary, textTransform: "capitalize", flex: 1 }}>
          {mealType}
        </Text>
        <Text style={{ fontSize: 13, color: colors.text.muted, marginRight: 4 }}>
          {isEmpty ? "— empty" : `${Math.round(mealCalories)} kcal`}
        </Text>
        <Button variant="ghost" size="sm" label="Add" onPress={() => onAdd(mealType)} />
      </View>

      {/* Food items — only rendered when present */}
      {items.map((log) => {
        const name = log.food_name ?? log.food?.name ?? "Unknown food";
        const pending = isPendingLogId(log.id);
        return (
          <SwipeToDeleteRow key={log.id} title={name} onDelete={() => onDelete(log.id)}>
            <TouchableOpacity
              activeOpacity={pending ? 1 : 0.7}
              disabled={pending}
              onPress={() => onEdit(log)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface.elevated,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.surface.border,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text.primary }} numberOfLines={1}>
                    {name}
                  </Text>
                  {pending && (
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#F59E0B" }}>SYNCING</Text>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: colors.text.muted }}>
                  {log.servings} × {log.food?.serving_label ?? "serving"}
                  {" · "}
                  <Text style={{ color: colors.macro.protein }}>{Math.round(log.protein_g)}p</Text>
                  {" "}
                  <Text style={{ color: colors.macro.carbs }}>{Math.round(log.carbs_g)}c</Text>
                  {" "}
                  <Text style={{ color: colors.macro.fat }}>{Math.round(log.fat_g)}f</Text>
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text.primary }}>
                {Math.round(log.calories)}
              </Text>
            </TouchableOpacity>
          </SwipeToDeleteRow>
        );
      })}
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
  const { data: goal } = useQuery({ queryKey: ["goal"], queryFn: getGoal });
  const deleteLog = useDeleteNutritionLog();
  const updateLog = useUpdateNutritionLog();
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const { isPremium, profile } = usePremium();
  const { calories, protein_g, carbs_g, fat_g, water_ml } = useDaySummary(selectedDate);
  const historyCutoff = historyCutoffDate(profile);
  const hasAnyLogs = (logs ?? []).length > 0;

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

  function handleSaveEdit(updates: {
    food_name: string;
    meal_type: MealType;
    servings: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    notes: string | null;
  }) {
    if (!editingLog) return;
    updateLog.mutate(
      { id: editingLog.id, date: selectedDate, updates },
      { onSuccess: () => setEditingLog(null) }
    );
  }

  return (
    <TabSafeArea>
      <View className="px-5 pt-4 pb-2">
        <Text style={{ fontSize: 32, fontWeight: "800", color: colors.text.primary, letterSpacing: -1 }}>Nutrition</Text>
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
        <Card variant="hero" className="mb-5">
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

          <WaterWidget
            date={selectedDate}
            water_ml={water_ml}
            target_ml={goal?.target_water_ml ?? 2500}
            variant="compact"
          />
        </Card>

        <TouchableOpacity
          style={{ borderRadius: 16 }}
          className="bg-surface-card border border-brand-500/40 p-4 mb-5 flex-row items-center justify-between"
          onPress={() => router.push("/meal-plan" as Href)}
          activeOpacity={0.85}
        >
          <View className="flex-1 mr-3">
            <Text className="text-white text-base font-bold">Generate an AI meal plan</Text>
            <Text className="text-slate-400 text-sm mt-0.5">
              A personalized plan you can log with one tap.
            </Text>
          </View>
          <View className="w-10 h-10 rounded-xl bg-brand-500/15 items-center justify-center">
            <Ionicons name="sparkles" size={20} color={colors.brand[400]} />
          </View>
        </TouchableOpacity>

        {recentFoods.length > 0 && selectedDate === today ? (
          <View className="mb-5">
            <SectionTitle>Recent foods</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {recentFoods.map((food) => (
                <TouchableOpacity
                  key={`${food.food_name}-${food.food_id ?? ""}`}
                  style={{ borderRadius: radii.md }}
                  className="bg-surface-card border border-surface-border px-4 py-3 mr-2 min-w-[120]"
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

        {/* Summary row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.muted, letterSpacing: 1.2, textTransform: "uppercase" }}>
            {selectedDate === today ? "Today's meals" : "Meals"}
          </Text>
          {Math.round(calories) > 0 && (
            <Text style={{ fontSize: 11, color: colors.text.muted }}>
              {Math.round(calories)} kcal
            </Text>
          )}
        </View>

        {hasAnyLogs ? (
          <View
            style={{
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.surface.border,
              overflow: "hidden",
              backgroundColor: colors.surface.card,
              marginBottom: 8,
            }}
          >
            {MEAL_TYPES.map((mealType, i) => (
              <MealSection
                key={mealType}
                mealType={mealType}
                logs={logs}
                onDelete={handleDelete}
                onAdd={handleAddFood}
                onEdit={setEditingLog}
                isFirst={i === 0}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="restaurant-outline"
            title="Nothing logged today"
            description="Tap Add next to any meal to start tracking."
            actionLabel="Log food"
            onAction={() => handleAddFood("breakfast")}
          />
        )}
      </ScrollView>

      <EditNutritionLogModal
        log={editingLog}
        saving={updateLog.isPending}
        onClose={() => setEditingLog(null)}
        onSave={handleSaveEdit}
      />
    </TabSafeArea>
  );
}
