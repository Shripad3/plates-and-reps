import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { TabSafeArea } from "@/components/TabSafeArea";
import { router, type Href } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  getProfile,
  getGoal,
  getBodyMetrics,
  updateProfile,
  updateActiveGoal,
  logBodyMetric,
  updateBodyMetric,
  deleteAccount,
} from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  ACTIVITY_LEVELS,
  GOAL_TYPES,
  SEX_OPTIONS,
  WEEKLY_WORKOUT_OPTIONS,
  APP_NAME,
  APP_AI_NAME,
} from "@/constants";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { usePremium } from "@/hooks/usePremium";
import { navigateToPaywall } from "@/lib/navigateToPaywall";
import { EditValueModal } from "@/components/EditValueModal";
import { EditPickerModal } from "@/components/EditPickerModal";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors } from "@/lib/theme";
import { todayLocal } from "@/lib/dates";

const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

type EditField =
  | "display_name"
  | "username"
  | "sex"
  | "height_cm"
  | "current_weight_kg"
  | "activity_level"
  | "goal_type"
  | "target_weight_kg"
  | "target_calories"
  | "target_protein_g"
  | "target_carbs_g"
  | "target_fat_g"
  | "target_water_l"
  | "weekly_workout_target"
  | null;

const PICKER_FIELDS = new Set<EditField>([
  "activity_level",
  "goal_type",
  "sex",
  "weekly_workout_target",
]);

function parseWeightKg(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateWeightKg(weight: number): string | null {
  if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) {
    return `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
  }
  return null;
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const inner = (
    <View className="flex-row justify-between items-center py-3 border-b border-surface-elevated">
      <Text className="text-slate-400 text-sm">{label}</Text>
      <View className="flex-row items-center gap-2 flex-1 justify-end ml-4">
        <Text className="text-white text-sm font-medium text-right">{value}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={14} color="#64748b" /> : null}
      </View>
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2 px-1">
        {title}
      </Text>
      <View className="bg-surface-card border border-surface-border rounded-xl px-4">{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const queryClient = useQueryClient();
  const { isPremium } = usePremium();
  const [editField, setEditField] = useState<EditField>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const refreshKeys = useMemo(() => [["profile"], ["goal"], ["body-metrics"]] as const, []);
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);
  useRefetchOnFocus(refreshKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });
  const { data: goal, isLoading: goalLoading } = useQuery({
    queryKey: ["goal"],
    queryFn: getGoal,
  });
  const { data: bodyMetrics = [], isLoading: metricsLoading } = useQuery({
    queryKey: ["body-metrics"],
    queryFn: () => getBodyMetrics(365),
  });

  const saveProfile = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditField(null);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const saveGoal = useMutation({
    mutationFn: updateActiveGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal"] });
      setEditField(null);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const saveCurrentWeight = useMutation({
    mutationFn: async (weight_kg: number) => {
      const latest = bodyMetrics[bodyMetrics.length - 1];
      if (latest) {
        return updateBodyMetric(latest.id, { weight_kg });
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
      setEditField(null);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const isSaving =
    saveProfile.isPending || saveGoal.isPending || saveCurrentWeight.isPending;

  const isLoading = profileLoading || goalLoading || metricsLoading;
  const latestMetric = bodyMetrics.length > 0 ? bodyMetrics[bodyMetrics.length - 1] : null;
  const currentWeightKg = latestMetric?.weight_kg ?? null;

  const activityLabel =
    ACTIVITY_LEVELS.find((a) => a.value === profile?.activity_level)?.label ??
    profile?.activity_level ??
    "Not set";

  const goalLabel =
    GOAL_TYPES.find((g) => g.value === goal?.goal_type)?.label ?? goal?.goal_type ?? "—";

  const sexLabel =
    SEX_OPTIONS.find((s) => s.value === profile?.sex)?.label ?? profile?.sex ?? "Not set";

  function handleLogout() {
    Alert.alert("Log out?", `You'll need to sign in again to use ${APP_NAME}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your profile, logs, workouts, and chat history. This cannot be undone.\n\nActive App Store subscriptions must be cancelled separately in Settings → Apple ID → Subscriptions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Your account and all data will be permanently removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete",
                  style: "destructive",
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      await deleteAccount();
                      await signOut();
                      queryClient.clear();
                      router.replace("/(auth)/login");
                      Alert.alert("Account deleted", "Your account has been permanently removed.");
                    } catch (err) {
                      Alert.alert("Deletion failed", (err as Error).message);
                    } finally {
                      setIsDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  function handleSaveText(value: string) {
    if (!editField) return;

    if (editField === "display_name") {
      const trimmed = value.trim();
      if (!trimmed) {
        Alert.alert("Required", "Display name cannot be empty.");
        return;
      }
      saveProfile.mutate({ display_name: trimmed });
      return;
    }

    if (editField === "username") {
      const trimmed = value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
        Alert.alert("Invalid username", "Use 3–20 characters: letters, numbers, or underscores.");
        return;
      }
      saveProfile.mutate({ username: trimmed });
      return;
    }

    if (editField === "height_cm") {
      const n = parseFloat(value);
      if (!Number.isFinite(n) || n < MIN_HEIGHT_CM || n > MAX_HEIGHT_CM) {
        Alert.alert("Invalid", `Enter height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`);
        return;
      }
      saveProfile.mutate({ height_cm: n });
      return;
    }

    if (editField === "current_weight_kg") {
      const w = parseWeightKg(value);
      if (w === null) {
        Alert.alert("Invalid", "Enter a valid weight.");
        return;
      }
      const err = validateWeightKg(w);
      if (err) {
        Alert.alert("Invalid weight", err);
        return;
      }
      saveCurrentWeight.mutate(w);
      return;
    }

    if (editField === "target_water_l") {
      const liters = parseFloat(value);
      if (!Number.isFinite(liters) || liters < 0.5 || liters > 10) {
        Alert.alert("Invalid", "Enter water target between 0.5 and 10 liters.");
        return;
      }
      saveGoal.mutate({ target_water_ml: Math.round(liters * 1000) });
      return;
    }

    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      Alert.alert("Invalid", "Enter a valid number.");
      return;
    }

    switch (editField) {
      case "target_weight_kg": {
        const err = validateWeightKg(n);
        if (err) {
          Alert.alert("Invalid weight", err);
          return;
        }
        saveGoal.mutate({ target_weight_kg: n });
        break;
      }
      case "target_calories":
        if (n < 800 || n > 10000) {
          Alert.alert("Invalid", "Calories should be between 800 and 10,000.");
          return;
        }
        saveGoal.mutate({ target_calories: Math.round(n) });
        break;
      case "target_protein_g":
      case "target_carbs_g":
      case "target_fat_g":
        if (n < 0 || n > 1000) {
          Alert.alert("Invalid", "Enter a macro target between 0 and 1000 g.");
          return;
        }
        saveGoal.mutate({
          [editField]: Math.round(n),
        } as Parameters<typeof updateActiveGoal>[0]);
        break;
    }
  }

  function handlePickerSelect(value: string) {
    if (!editField) return;

    switch (editField) {
      case "activity_level":
        saveProfile.mutate({ activity_level: value });
        break;
      case "sex":
        saveProfile.mutate({
          sex: value as "male" | "female" | "other" | "prefer_not_to_say",
        });
        break;
      case "goal_type":
        saveGoal.mutate({
          goal_type: value as "weight_loss" | "muscle_gain" | "maintenance" | "custom",
        });
        break;
      case "weekly_workout_target":
        saveGoal.mutate({ weekly_workout_target: parseInt(value, 10) });
        break;
    }
  }

  const textEditConfig = useMemo(() => {
    switch (editField) {
      case "display_name":
        return {
          title: "Display name",
          label: "How should we greet you?",
          unit: "",
          initial: profile?.display_name ?? "",
          keyboard: "default" as const,
        };
      case "username":
        return {
          title: "Username",
          label: "Letters, numbers, underscores only",
          unit: "",
          initial: profile?.username ?? "",
          keyboard: "default" as const,
        };
      case "height_cm":
        return {
          title: "Height",
          label: "Your height",
          unit: "cm",
          initial: String(profile?.height_cm ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "current_weight_kg":
        return {
          title: "Current weight",
          label: "Latest weigh-in",
          unit: "kg",
          initial: currentWeightKg != null ? String(currentWeightKg) : "",
          keyboard: "decimal-pad" as const,
        };
      case "target_weight_kg":
        return {
          title: "Goal weight",
          label: "Target weight",
          unit: "kg",
          initial: String(goal?.target_weight_kg ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "target_calories":
        return {
          title: "Daily calories",
          label: "Calorie target",
          unit: "kcal",
          initial: String(goal?.target_calories ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "target_protein_g":
        return {
          title: "Protein target",
          label: "Daily protein",
          unit: "g",
          initial: String(goal?.target_protein_g ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "target_carbs_g":
        return {
          title: "Carbs target",
          label: "Daily carbohydrates",
          unit: "g",
          initial: String(goal?.target_carbs_g ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "target_fat_g":
        return {
          title: "Fat target",
          label: "Daily fat",
          unit: "g",
          initial: String(goal?.target_fat_g ?? ""),
          keyboard: "decimal-pad" as const,
        };
      case "target_water_l":
        return {
          title: "Water target",
          label: "Daily water goal",
          unit: "L",
          initial: goal ? String(goal.target_water_ml / 1000) : "",
          keyboard: "decimal-pad" as const,
        };
      default:
        return null;
    }
  }, [editField, profile, goal, currentWeightKg]);

  const pickerConfig = useMemo(() => {
    switch (editField) {
      case "activity_level":
        return {
          title: "Activity level",
          subtitle: "How active are you on a typical week?",
          selected: profile?.activity_level ?? null,
          options: ACTIVITY_LEVELS.map((a) => ({
            value: a.value,
            label: a.label,
            description: a.description,
          })),
        };
      case "sex":
        return {
          title: "Sex",
          subtitle: "Used for calorie calculations",
          selected: profile?.sex ?? null,
          options: SEX_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
        };
      case "goal_type":
        return {
          title: "Goal",
          subtitle: "What are you working toward?",
          selected: goal?.goal_type ?? null,
          options: GOAL_TYPES.map((g) => ({ value: g.value, label: g.label })),
        };
      case "weekly_workout_target":
        return {
          title: "Weekly workouts",
          subtitle: "How many sessions per week?",
          selected: goal ? String(goal.weekly_workout_target) : null,
          options: WEEKLY_WORKOUT_OPTIONS,
        };
      default:
        return null;
    }
  }, [editField, profile, goal]);

  if (isLoading) {
    return (
      <TabSafeArea>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      </TabSafeArea>
    );
  }

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? "?";

  return (
    <TabSafeArea>
      <ScreenHeader title="Account" />

      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
        }
      >
        <View className="items-center py-6 mb-2">
          <View className="w-20 h-20 rounded-full bg-brand-500/15 border border-brand-500/25 items-center justify-center mb-3">
            <Text className="text-brand-400 text-3xl font-bold">{initial}</Text>
          </View>
          <Text className="text-white text-xl font-bold">{profile?.display_name ?? "User"}</Text>
          {profile?.username ? (
            <Text className="text-slate-400 text-sm mt-1">@{profile.username}</Text>
          ) : null}
          {isPremium ? (
            <View className="bg-amber-500/20 rounded-full px-3 py-1 mt-2">
              <Text className="text-amber-400 text-xs font-semibold">Premium</Text>
            </View>
          ) : (
            <TouchableOpacity
              className="bg-brand-500 rounded-full px-4 py-2 mt-3"
              onPress={navigateToPaywall}
            >
              <Text className="text-white text-xs font-semibold">Upgrade to Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        <Section title="Coach">
          <InfoRow
            label={APP_AI_NAME}
            value="Open chat"
            onPress={() => router.push("/chat")}
          />
        </Section>

        <Section title="Account">
          <InfoRow label="Email" value={user?.email ?? "—"} />
          <InfoRow
            label="Display name"
            value={profile?.display_name ?? "—"}
            onPress={() => setEditField("display_name")}
          />
          <InfoRow
            label="Username"
            value={profile?.username ? `@${profile.username}` : "—"}
            onPress={() => setEditField("username")}
          />
          <InfoRow
            label="Member since"
            value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })
                : "—"
            }
          />
        </Section>

        <Section title="Body stats">
          <InfoRow
            label="Current weight"
            value={currentWeightKg != null ? `${currentWeightKg} kg` : "Not set"}
            onPress={() => setEditField("current_weight_kg")}
          />
          <InfoRow
            label="Height"
            value={profile?.height_cm ? `${profile.height_cm} cm` : "Not set"}
            onPress={() => setEditField("height_cm")}
          />
          <InfoRow label="Sex" value={sexLabel} onPress={() => setEditField("sex")} />
          <InfoRow
            label="Activity level"
            value={activityLabel}
            onPress={() => setEditField("activity_level")}
          />
        </Section>

        {goal ? (
          <Section title="Goals">
            <InfoRow label="Goal" value={goalLabel} onPress={() => setEditField("goal_type")} />
            <InfoRow
              label="Daily calories"
              value={goal.target_calories ? `${goal.target_calories} kcal` : "Not set"}
              onPress={() => setEditField("target_calories")}
            />
            <InfoRow
              label="Protein"
              value={goal.target_protein_g != null ? `${goal.target_protein_g} g` : "Not set"}
              onPress={() => setEditField("target_protein_g")}
            />
            <InfoRow
              label="Carbs"
              value={goal.target_carbs_g != null ? `${goal.target_carbs_g} g` : "Not set"}
              onPress={() => setEditField("target_carbs_g")}
            />
            <InfoRow
              label="Fat"
              value={goal.target_fat_g != null ? `${goal.target_fat_g} g` : "Not set"}
              onPress={() => setEditField("target_fat_g")}
            />
            <InfoRow
              label="Target weight"
              value={goal.target_weight_kg ? `${goal.target_weight_kg} kg` : "Not set"}
              onPress={() => setEditField("target_weight_kg")}
            />
            <InfoRow
              label="Water target"
              value={`${(goal.target_water_ml / 1000).toFixed(1)} L / day`}
              onPress={() => setEditField("target_water_l")}
            />
            <InfoRow
              label="Weekly workouts"
              value={`${goal.weekly_workout_target} sessions`}
              onPress={() => setEditField("weekly_workout_target")}
            />
          </Section>
        ) : null}

        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            className="flex-1 bg-surface-card border border-surface-border rounded-xl py-3 items-center"
            onPress={() => router.push("/legal/privacy" as Href)}
          >
            <Text className="text-slate-400 text-sm">Privacy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-surface-card border border-surface-border rounded-xl py-3 items-center"
            onPress={() => router.push("/legal/terms" as Href)}
          >
            <Text className="text-slate-400 text-sm">Terms</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="bg-red-500/15 border border-red-500/30 rounded-2xl py-4 items-center mb-3"
          onPress={handleLogout}
        >
          <Text className="text-red-400 font-semibold text-base">Log out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="border border-red-500/20 rounded-2xl py-4 items-center mb-10"
          onPress={handleDeleteAccount}
          disabled={isDeleting}
        >
          <Text className="text-red-400/80 font-medium text-sm">
            {isDeleting ? "Deleting account…" : "Delete account"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {textEditConfig && editField && !PICKER_FIELDS.has(editField) ? (
        <EditValueModal
          visible
          title={textEditConfig.title}
          label={textEditConfig.label}
          unit={textEditConfig.unit}
          initialValue={textEditConfig.initial}
          keyboardType={textEditConfig.keyboard}
          saving={isSaving}
          onClose={() => setEditField(null)}
          onSave={handleSaveText}
        />
      ) : null}

      {pickerConfig && editField && PICKER_FIELDS.has(editField) ? (
        <EditPickerModal
          visible
          title={pickerConfig.title}
          subtitle={pickerConfig.subtitle}
          options={pickerConfig.options}
          selectedValue={pickerConfig.selected}
          saving={isSaving}
          onClose={() => setEditField(null)}
          onSelect={handlePickerSelect}
        />
      ) : null}
    </TabSafeArea>
  );
}
