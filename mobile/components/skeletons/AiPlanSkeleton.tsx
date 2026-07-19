import { View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

function DayCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="mb-3">
      <Skeleton width={140} height={15} style={{ marginBottom: 12 }} />
      <View style={{ gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} className="flex-row justify-between">
            <Skeleton width={"55%"} height={13} />
            <Skeleton width={44} height={13} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Mirrors the generated workout-plan result: title + per-day exercise cards. */
export function AiPlanSkeleton() {
  return (
    <View>
      <Skeleton width={"65%"} height={24} style={{ marginBottom: 8 }} />
      <Skeleton width={"40%"} height={14} style={{ marginBottom: 16 }} />
      <DayCardSkeleton rows={5} />
      <DayCardSkeleton rows={4} />
      <DayCardSkeleton rows={5} />
    </View>
  );
}
