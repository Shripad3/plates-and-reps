import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";

/** List-row cards for the Train tab's routines / history sections. */
export function WorkoutRowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="bg-surface-card border border-surface-border rounded-lg p-4 mb-2 flex-row items-center justify-between"
        >
          <View className="flex-1 mr-3" style={{ gap: 8 }}>
            <Skeleton width={"55%"} height={14} />
            <Skeleton width={"35%"} height={11} />
          </View>
          <Skeleton width={20} height={20} radius={6} />
        </View>
      ))}
    </>
  );
}
