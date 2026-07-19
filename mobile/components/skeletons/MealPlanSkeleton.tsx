import { View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

function MealRowSkeleton() {
  return (
    <View className="mt-2 pt-2 border-t border-surface-border" style={{ gap: 8 }}>
      <Skeleton width={80} height={12} />
      <View className="flex-row justify-between">
        <Skeleton width={"55%"} height={12} />
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );
}

function DayCardSkeleton({ meals = 3 }: { meals?: number }) {
  return (
    <Card className="mb-3">
      <Skeleton width={70} height={15} style={{ marginBottom: 8 }} />
      <Skeleton width={"70%"} height={11} />
      {Array.from({ length: meals }).map((_, i) => (
        <MealRowSkeleton key={i} />
      ))}
    </Card>
  );
}

/** Mirrors the generated meal-plan result: title + per-day meal cards. */
export function MealPlanSkeleton() {
  return (
    <View>
      <Skeleton width={"65%"} height={24} style={{ marginBottom: 8 }} />
      <Skeleton width={"45%"} height={14} style={{ marginBottom: 16 }} />
      <DayCardSkeleton meals={3} />
      <DayCardSkeleton meals={4} />
      <DayCardSkeleton meals={3} />
    </View>
  );
}
