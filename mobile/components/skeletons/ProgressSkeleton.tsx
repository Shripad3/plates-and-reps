import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors the progress screen's weight-trend chart card + history rows. */
export function ProgressChartSkeleton() {
  return (
    <>
      <View className="mx-5 mt-4">
        <View className="bg-surface-card border border-surface-border rounded-2xl p-4">
          <Skeleton width={100} height={13} style={{ marginBottom: 12 }} />
          <Skeleton height={160} radius={12} />
        </View>
      </View>
      <View className="px-5 mt-5 mb-8">
        <Skeleton width={80} height={11} style={{ marginBottom: 12 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 mb-1.5 flex-row justify-between"
          >
            <Skeleton width={110} height={12} />
            <Skeleton width={50} height={13} />
          </View>
        ))}
      </View>
    </>
  );
}
