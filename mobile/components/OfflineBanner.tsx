import { View, Text, ActivityIndicator } from "react-native";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { colors } from "@/lib/theme";

export function OfflineBanner() {
  const { isSyncing, pendingCount } = useOfflineSync();

  if (pendingCount === 0) return null;

  return (
    <View className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex-row items-center justify-center gap-2">
      {isSyncing ? (
        <ActivityIndicator size="small" color={colors.meal.breakfast} />
      ) : null}
      <Text className="text-amber-300 text-xs font-medium text-center">
        {isSyncing
          ? "Syncing offline logs…"
          : `${pendingCount} log${pendingCount === 1 ? "" : "s"} waiting to sync`}
      </Text>
    </View>
  );
}
