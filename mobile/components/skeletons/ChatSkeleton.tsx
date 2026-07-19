import { View } from "react-native";
import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";

function Bubble({ side, width, lines }: { side: "left" | "right"; width: number; lines: number }) {
  return (
    <View className={side === "right" ? "items-end" : "items-start"} style={{ marginBottom: 16 }}>
      <View
        className="bg-surface-card rounded-2xl p-3"
        style={{ width: `${width}%`, gap: 8 }}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={11} width={i === lines - 1 ? "70%" : "100%"} />
        ))}
      </View>
    </View>
  );
}

/** Mirrors the AI coach chat: header, message bubbles, and input bar. */
export function ChatSkeleton() {
  return (
    <View className="flex-1">
      <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b border-surface-border">
        <Skeleton width={24} height={24} radius={6} />
        <SkeletonCircle size={36} />
        <View className="flex-1" style={{ gap: 6 }}>
          <Skeleton width={120} height={13} />
          <Skeleton width={70} height={10} />
        </View>
      </View>

      <View className="flex-1 px-5 pt-4">
        <Bubble side="left" width={72} lines={3} />
        <Bubble side="right" width={55} lines={2} />
        <Bubble side="left" width={80} lines={4} />
        <Bubble side="right" width={45} lines={1} />
      </View>

      <View className="px-5 pb-4 pt-2 border-t border-surface-border flex-row items-center gap-2">
        <Skeleton height={44} radius={22} style={{ flex: 1 }} />
        <SkeletonCircle size={44} />
      </View>
    </View>
  );
}
