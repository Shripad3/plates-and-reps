import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";

function ExerciseCardSkeleton({ sets = 3 }: { sets?: number }) {
  return (
    <View className="bg-surface-card rounded-2xl p-4 mb-4">
      <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
        <Skeleton width={22} height={22} radius={6} />
        <Skeleton width={150} height={16} />
      </View>
      <View style={{ gap: 10 }}>
        {Array.from({ length: sets }).map((_, i) => (
          <View key={i} className="flex-row items-center" style={{ gap: 8 }}>
            <Skeleton width={28} height={14} />
            <Skeleton height={30} style={{ flex: 1 }} />
            <Skeleton height={30} style={{ flex: 1 }} />
            <Skeleton width={40} height={14} />
          </View>
        ))}
      </View>
      <Skeleton height={40} radius={12} style={{ marginTop: 12 }} />
    </View>
  );
}

/** Mirrors the active workout session: header bar + exercise cards. */
export function WorkoutSessionSkeleton() {
  return (
    <View className="flex-1">
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <Skeleton width={70} height={34} radius={8} />
        <Skeleton width={60} height={20} radius={6} />
        <Skeleton width={72} height={34} radius={8} />
      </View>
      <View className="px-5 pt-1">
        <ExerciseCardSkeleton sets={3} />
        <ExerciseCardSkeleton sets={2} />
        <ExerciseCardSkeleton sets={3} />
      </View>
    </View>
  );
}
