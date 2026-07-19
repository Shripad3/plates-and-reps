import { View } from "react-native";
import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";

function MealSectionSkeleton({ isFirst, rows }: { isFirst: boolean; rows: number }) {
  return (
    <View className={`px-4 py-3 ${isFirst ? "" : "border-t border-surface-border"}`}>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <SkeletonCircle size={8} />
          <Skeleton width={80} height={14} />
        </View>
        <Skeleton width={40} height={12} />
      </View>
      <View style={{ gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} className="flex-row justify-between">
            <Skeleton width={"55%"} height={12} />
            <Skeleton width={44} height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Mirrors the nutrition diary's meal-section list (Breakfast → Snack). */
export function NutritionDiarySkeleton() {
  return (
    <View className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
      <MealSectionSkeleton isFirst rows={2} />
      <MealSectionSkeleton isFirst={false} rows={1} />
      <MealSectionSkeleton isFirst={false} rows={2} />
      <MealSectionSkeleton isFirst={false} rows={1} />
    </View>
  );
}
