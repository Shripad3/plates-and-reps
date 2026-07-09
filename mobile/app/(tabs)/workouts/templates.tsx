import { useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useWorkoutTemplates,
  useDeleteWorkoutTemplate,
} from "@/hooks/useWorkouts";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/EmptyState";
import { colors } from "@/lib/theme";

export default function TemplatesScreen() {
  const refreshKeys = useMemo(() => [["workout-templates"]] as const, []);
  const { refreshing, onRefresh } = useScreenRefresh([...refreshKeys]);
  useRefetchOnFocus(refreshKeys);

  const { data: templates = [] } = useWorkoutTemplates();
  const deleteTemplate = useDeleteWorkoutTemplate();

  function confirmDelete(id: string, name: string) {
    Alert.alert("Delete routine?", `Remove "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteTemplate.mutate(id),
      },
    ]);
  }

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface">
        <ScreenHeader
          title="My Routines"
          right={
            <TouchableOpacity onPress={() => router.push("/(tabs)/workouts/create-template")}>
              <Text className="text-brand-400 text-sm font-medium">+ New</Text>
            </TouchableOpacity>
          }
        />

        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[400]} />
          }
        >
          {templates.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="No routines yet"
              description="Create a routine to quickly start your favourite workouts."
              actionLabel="Create Routine"
              onAction={() => router.push("/(tabs)/workouts/create-template")}
            />
          ) : (
            templates.map((t) => (
              <View key={t.id} className="bg-surface-card rounded-xl p-4 mb-3">
                <TouchableOpacity
                  className="flex-row items-center justify-between"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/workouts/template-detail",
                      params: { templateId: t.id },
                    })
                  }
                >
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">{t.name}</Text>
                    {t.description ? (
                      <Text className="text-slate-400 text-sm mt-0.5">{t.description}</Text>
                    ) : null}
                    <Text className="text-slate-500 text-xs mt-1">
                      {t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                </TouchableOpacity>
                <View className="flex-row mt-3 pt-3 border-t border-surface-elevated">
                  <TouchableOpacity
                    className="flex-1 bg-red-500/15 rounded-lg py-2 items-center"
                    onPress={() => confirmDelete(t.id, t.name)}
                  >
                    <Text className="text-red-400 text-sm font-medium">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View className="h-8" />
        </ScrollView>
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
