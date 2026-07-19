import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";

/** Summary card at the top of the session-detail screen. */
export function WorkoutSummarySkeleton() {
  return (
    <View className="bg-surface-card rounded-2xl p-4 mb-4" style={{ gap: 8 }}>
      <Skeleton width={"55%"} height={20} />
      <Skeleton width={"40%"} height={12} />
      <Skeleton width={"50%"} height={12} />
    </View>
  );
}

/** Exercise cards with a set table (session-detail). */
export function SessionExercisesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="bg-surface-card rounded-xl p-4 mb-3">
          <Skeleton width={130} height={15} style={{ marginBottom: 12 }} />
          <View style={{ gap: 8 }}>
            {Array.from({ length: 3 }).map((_, j) => (
              <View key={j} className="flex-row gap-2">
                <Skeleton width={28} height={13} />
                <Skeleton height={13} style={{ flex: 1 }} />
                <Skeleton height={13} style={{ flex: 1 }} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

/** Exercise cards with a single summary line (template-detail). */
export function TemplateExercisesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="bg-surface-card rounded-xl p-4 mb-3" style={{ gap: 8 }}>
          <Skeleton width={140} height={15} />
          <Skeleton width={"45%"} height={12} />
        </View>
      ))}
    </>
  );
}
