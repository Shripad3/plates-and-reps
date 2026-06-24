import { useState, useMemo, type ReactNode } from "react";
import { ScrollView, View, Text, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { TabSafeArea } from "@/components/TabSafeArea";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBodyMetrics,
  logBodyMetric,
  getGoal,
  updateBodyMetric,
  updateActiveGoal,
} from "@/lib/api";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { todayLocal } from "@/lib/dates";
import { AppTextInput } from "@/components/AppTextInput";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WeightLineChart } from "@/components/WeightLineChart";
import { EditValueModal } from "@/components/EditValueModal";
import { colors } from "@/lib/theme";

const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

function parseWeightKg(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function validateWeightKg(weight: number): string | null {
  if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
    return `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
  }
  return null;
}

function StatCard({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: ReactNode;
  onEdit?: () => void;
}) {
  const inner = (
    <>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-slate-400 text-xs">{label}</Text>
        {onEdit ? <Ionicons name="pencil" size={12} color="#64748b" /> : null}
      </View>
      {typeof value === "string" ? (
        <Text className="text-white text-2xl font-bold">{value}</Text>
      ) : (
        value
      )}
    </>
  );

  if (!onEdit) {
    return <View className="flex-1 bg-surface-card border border-surface-border rounded-xl p-4">{inner}</View>;
  }

  return (
    <TouchableOpacity
      className="flex-1 bg-surface-card border border-surface-border rounded-xl p-4"
      onPress={onEdit}
      activeOpacity={0.75}
    >
      {inner}
    </TouchableOpacity>
  );
}

export default function ProgressScreen() {
  const [weightInput, setWeightInput] = useState("");
  const [editTarget, setEditTarget] = useState<"current" | "goal" | null>(null);
  const queryClient = useQueryClient();

  const refreshKeys = useMemo(() => [["body-metrics"], ["goal"]] as const, []);
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);
  useRefetchOnFocus(refreshKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: metrics = [] } = useQuery({
    queryKey: ["body-metrics"],
    queryFn: () => getBodyMetrics(90),
  });

  const { data: goal } = useQuery({ queryKey: ["goal"], queryFn: getGoal });

  const logMetric = useMutation({
    mutationFn: (weight_kg: number) =>
      logBodyMetric({
        date: todayLocal(),
        weight_kg,
        body_fat_pct: null,
        measurements: null,
        notes: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body-metrics"] });
      setWeightInput("");
    },
  });

  const updateCurrentWeight = useMutation({
    mutationFn: async (weight_kg: number) => {
      const allMetrics = await getBodyMetrics(365);
      const latestMetric = allMetrics[allMetrics.length - 1];
      if (latestMetric) {
        return updateBodyMetric(latestMetric.id, { weight_kg });
      }
      return logBodyMetric({
        date: todayLocal(),
        weight_kg,
        body_fat_pct: null,
        measurements: null,
        notes: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body-metrics"] });
      setEditTarget(null);
    },
  });

  const updateGoalWeight = useMutation({
    mutationFn: (target_weight_kg: number) => updateActiveGoal({ target_weight_kg }),
    onSuccess: (savedGoal) => {
      queryClient.setQueryData(["goal"], savedGoal);
      setEditTarget(null);
    },
  });

  function handleLogWeight() {
    const w = parseWeightKg(weightInput);
    if (w === null) {
      Alert.alert("Error", "Enter a valid weight.");
      return;
    }
    const validationError = validateWeightKg(w);
    if (validationError) {
      Alert.alert("Invalid weight", validationError);
      return;
    }
    logMetric.mutate(w);
  }

  function handleSaveEdit(value: string) {
    const w = parseWeightKg(value);
    if (w === null) {
      Alert.alert("Error", "Enter a valid weight.");
      return;
    }
    const validationError = validateWeightKg(w);
    if (validationError) {
      Alert.alert("Invalid weight", validationError);
      return;
    }

    if (editTarget === "current") {
      updateCurrentWeight.mutate(w);
      return;
    }

    if (editTarget === "goal") {
      if (!goal) {
        Alert.alert("Error", "No active goal found.");
        return;
      }
      updateGoalWeight.mutate(w);
    }
  }

  const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const latestWeight = latestMetric?.weight_kg ?? null;
  const firstWeight = metrics.length > 0 ? metrics[0].weight_kg : null;
  const weightChange =
    latestWeight && firstWeight ? latestWeight - firstWeight : null;

  const weightMetrics = metrics.filter((m) => m.weight_kg !== null);

  const editModalVisible = editTarget !== null;
  const editSaving = updateCurrentWeight.isPending || updateGoalWeight.isPending;
  const editInitialValue =
    editTarget === "current"
      ? latestWeight != null
        ? String(latestWeight)
        : ""
      : goal?.target_weight_kg != null
        ? String(goal.target_weight_kg)
        : "";

  return (
    <TabSafeArea>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
      >
        <View className="px-5 pt-4 pb-2">
          <Text className="text-white text-2xl font-bold tracking-tight">Progress</Text>
        </View>

        <View className="mx-5 mt-4">
          <Card>
            <Text className="text-white font-semibold mb-3">Log today's weight</Text>
            <View className="flex-row gap-3 items-center">
              <AppTextInput
                className="flex-1 bg-surface-elevated text-white rounded-xl border border-surface-border"
                placeholder="e.g. 75.2"
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
              />
              <Text className="text-slate-400">kg</Text>
              <Button label="Log" size="sm" onPress={handleLogWeight} loading={logMetric.isPending} />
            </View>
          </Card>
        </View>

        <View className="mx-5 mt-4 flex-row gap-3">
          <StatCard
            label="Current"
            value={latestWeight != null ? `${latestWeight}kg` : "—"}
            onEdit={() => setEditTarget("current")}
          />
          <StatCard
            label="Goal"
            value={goal?.target_weight_kg != null ? `${goal.target_weight_kg}kg` : "—"}
            onEdit={() => {
              if (!goal) {
                Alert.alert("No goal", "Complete onboarding or set a goal first.");
                return;
              }
              setEditTarget("goal");
            }}
          />
          {weightChange !== null && (
            <StatCard
              label="90-day change"
              value={
                <Text
                  className={`text-2xl font-bold ${
                    weightChange < 0
                      ? "text-green-400"
                      : weightChange > 0
                        ? "text-red-400"
                        : "text-white"
                  }`}
                >
                  {weightChange > 0 ? "+" : ""}
                  {weightChange.toFixed(1)}kg
                </Text>
              }
            />
          )}
        </View>

        {weightMetrics.length > 1 && (
          <View className="mx-5 mt-4">
            <Card>
              <Text className="text-white font-semibold mb-3">Weight trend</Text>
              <WeightLineChart metrics={weightMetrics} goalWeightKg={goal?.target_weight_kg} />
            </Card>
          </View>
        )}

        {weightMetrics.length > 0 && (
          <View className="px-5 mt-5 mb-8">
            <Text className="text-white font-semibold text-base mb-3">History</Text>
            {[...weightMetrics].reverse().slice(0, 10).map((m) => (
              <View
                key={m.id}
                className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 mb-1.5 flex-row justify-between"
              >
                <Text className="text-slate-400 text-sm">
                  {new Date(m.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text className="text-white font-semibold">{m.weight_kg}kg</Text>
              </View>
            ))}
          </View>
        )}

        {weightMetrics.length === 0 && (
          <EmptyState
            icon="analytics-outline"
            title="Start tracking your weight"
            description="Log your weight daily to visualize progress over time."
          />
        )}
      </ScrollView>

      <EditValueModal
        visible={editModalVisible}
        title={editTarget === "goal" ? "Edit goal weight" : "Edit current weight"}
        label={
          editTarget === "goal"
            ? "Update your target weight."
            : "Update your most recent weight entry."
        }
        unit="kg"
        initialValue={editInitialValue}
        placeholder="e.g. 75.2"
        saving={editSaving}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
      />
    </TabSafeArea>
  );
}
