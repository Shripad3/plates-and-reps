import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { EmptyState } from "@/components/EmptyState";
import { WorkoutRowsSkeleton } from "@/components/skeletons/WorkoutsSkeleton";
import { useWorkoutTemplates } from "@/hooks/useWorkouts";
import { colors, radii } from "@/lib/theme";

export default function AnalyzePickerScreen() {
  const { data: templates = [], isLoading } = useWorkoutTemplates();

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface">
        <ScreenHeader title="Analyze a routine" />
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <Text className="text-slate-400 text-sm mb-4">
            Pick a routine to get a scored breakdown — muscle coverage, balance, goal fit, and how to improve it.
          </Text>

          {isLoading && templates.length === 0 ? (
            <WorkoutRowsSkeleton count={3} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="No routines to analyze yet"
              description="Create a routine first, then come back to get it analyzed."
              actionLabel="Create routine"
              onAction={() => router.push("/(tabs)/workouts/create-template")}
            />
          ) : (
            templates.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={{ borderRadius: radii.sm }}
                className="bg-surface-card border border-surface-border p-4 mb-2 flex-row items-center justify-between"
                activeOpacity={0.75}
                onPress={() => router.push({ pathname: "/(tabs)/workouts/analysis", params: { routineId: t.id } })}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-white font-medium">{t.name}</Text>
                  <Text className="text-slate-500 text-xs mt-1">
                    {t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Ionicons name="sparkles" size={18} color={colors.brand[400]} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
