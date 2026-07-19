import { View } from "react-native";
import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";

function SectionBlock({ rows = 3 }: { rows?: number }) {
  return (
    <View className="px-5 mb-6">
      <Skeleton width={90} height={11} radius={4} style={{ marginBottom: 12 }} />
      <View className="bg-surface-card border border-surface-border rounded-2xl p-4" style={{ gap: 16 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} className="flex-row items-center justify-between">
            <Skeleton width={110} height={13} />
            <Skeleton width={70} height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Mirrors the Account screen: avatar header + titled row-sections. */
export function ProfileSkeleton() {
  return (
    <View className="flex-1">
      <View className="items-center py-6 mb-2">
        <SkeletonCircle size={80} style={{ marginBottom: 12 }} />
        <Skeleton width={140} height={18} style={{ marginBottom: 8 }} />
        <Skeleton width={90} height={12} />
      </View>
      <SectionBlock rows={2} />
      <SectionBlock rows={3} />
      <SectionBlock rows={4} />
    </View>
  );
}
