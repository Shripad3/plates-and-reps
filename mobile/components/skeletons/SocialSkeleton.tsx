import { View } from "react-native";
import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";

function FeedCardSkeleton() {
  return (
    <View className="bg-surface-card border border-surface-border rounded-xl p-4 mb-3">
      <View className="flex-row items-center gap-3 mb-3">
        <SkeletonCircle size={40} />
        <View className="flex-1" style={{ gap: 6 }}>
          <Skeleton width={130} height={13} />
          <Skeleton width={90} height={11} />
        </View>
        <Skeleton width={36} height={10} />
      </View>
      <View className="bg-surface border border-surface-border rounded-xl p-3 mb-3" style={{ gap: 8 }}>
        <Skeleton width={"60%"} height={13} />
        <View className="flex-row gap-4">
          <Skeleton width={50} height={11} />
          <Skeleton width={60} height={11} />
        </View>
      </View>
      <View className="flex-row gap-2">
        <Skeleton width={48} height={30} radius={999} />
        <Skeleton width={48} height={30} radius={999} />
        <Skeleton width={48} height={30} radius={999} />
      </View>
    </View>
  );
}

/** Mirrors the activity feed: a stack of post cards. */
export function SocialFeedSkeleton() {
  return (
    <View>
      <FeedCardSkeleton />
      <FeedCardSkeleton />
      <FeedCardSkeleton />
    </View>
  );
}
