import { useState, useMemo, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  FlatList,
} from "react-native";
import { router, type Href } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useTabBarScrollPadding } from "@/hooks/useTabBarScrollPadding";
import { TabSafeArea } from "@/components/TabSafeArea";
import { AppTextInput } from "@/components/AppTextInput";
import { EmptyState } from "@/components/EmptyState";
import { colors } from "@/lib/theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFeed,
  toggleReaction,
  searchUsers,
  getFollowing,
  getFollowers,
  getFollowRequests,
  getFriends,
  followUser,
  unfollowUser,
  acceptFollowRequest,
  declineFollowRequest,
  removeFollower,
} from "@/lib/api";
import { REACTION_TYPES } from "@/constants";
import type { ActivityFeedItem, PublicProfile, SocialConnection } from "@/types";

const ACTIVITY_LABELS: Record<string, string> = {
  workout_completed: "completed a workout",
  cardio_completed: "logged a cardio session",
  streak_achieved: "hit a streak milestone",
  challenge_won: "won a challenge",
  challenge_joined: "joined a challenge",
  pr_achieved: "set a new PR",
};

type PeopleSection = "friends" | "following" | "followers" | "requests";

function UserAvatar({ name }: { name?: string }) {
  return (
    <View className="w-12 h-12 rounded-full bg-brand-500/15 border border-brand-500/25 items-center justify-center">
      <Text className="text-brand-400 font-bold text-lg">
        {name?.[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

function UserCard({
  profile,
  action,
}: {
  profile: PublicProfile;
  action?: ReactNode;
}) {
  return (
    <View className="bg-surface-card border border-surface-border rounded-xl p-4 mb-2 flex-row items-center gap-3">
      <UserAvatar name={profile.display_name} />
      <View className="flex-1">
        <Text className="text-white font-semibold">{profile.display_name}</Text>
        {profile.username ? (
          <Text className="text-slate-400 text-sm">@{profile.username}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function FeedCard({ item }: { item: ActivityFeedItem }) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const isOwnPost = item.user_id === currentUserId;
  const canViewWorkout =
    item.activity_type === "workout_completed" && !!item.reference_id;

  const react = useMutation({
    mutationFn: (reactionType: string) =>
      toggleReaction(item.id, reactionType, item.user_reaction ?? null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  const reactionCounts = (item.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reaction_type] = (acc[r.reaction_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View className="bg-surface-card border border-surface-border rounded-xl p-4 mb-3">
      <View className="flex-row items-center gap-3 mb-3">
        <View className="w-10 h-10 rounded-full bg-brand-500/15 border border-brand-500/25 items-center justify-center">
          <Text className="text-brand-400 font-bold text-base">
            {item.profile?.display_name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-white font-semibold">{item.profile?.display_name}</Text>
          <Text className="text-slate-400 text-sm">
            {ACTIVITY_LABELS[item.activity_type] ?? item.activity_type}
          </Text>
        </View>
        <Text className="text-slate-500 text-xs">
          {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      </View>

      {Object.keys(item.metadata ?? {}).length > 0 && (
        <TouchableOpacity
          className="bg-surface border border-surface-border rounded-xl p-3 mb-3"
          activeOpacity={canViewWorkout ? 0.7 : 1}
          onPress={() => {
            if (!canViewWorkout) return;
            router.push(
              `/(tabs)/workouts/session-detail?id=${item.reference_id}` as Href
            );
          }}
          disabled={!canViewWorkout}
        >
          {!!item.metadata.workout_name && (
            <Text className="text-white font-medium">{String(item.metadata.workout_name)}</Text>
          )}
          <View className="flex-row gap-4 mt-1 flex-wrap">
            {!!item.metadata.duration_seconds && (
              <Text className="text-slate-400 text-sm">
                {Math.round(Number(item.metadata.duration_seconds) / 60)} min
              </Text>
            )}
            {!!item.metadata.exercise_count && (
              <Text className="text-slate-400 text-sm">
                {String(item.metadata.exercise_count)} exercise
                {Number(item.metadata.exercise_count) !== 1 ? "s" : ""}
              </Text>
            )}
            {!!item.metadata.set_count && (
              <Text className="text-slate-400 text-sm">
                {String(item.metadata.set_count)} set
                {Number(item.metadata.set_count) !== 1 ? "s" : ""}
              </Text>
            )}
            {!!item.metadata.streak_count && (
              <Text className="text-slate-400 text-sm">
                {String(item.metadata.streak_count)} day streak
              </Text>
            )}
          </View>
          {canViewWorkout ? (
            <Text className="text-brand-400 text-sm font-medium mt-2">View full workout →</Text>
          ) : null}
        </TouchableOpacity>
      )}

      <View className="flex-row gap-2 flex-wrap">
        {REACTION_TYPES.map((r) => {
          const count = reactionCounts[r.value] ?? 0;
          const isMyReaction = item.user_reaction === r.value;
          return (
            <TouchableOpacity
              key={r.value}
              className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                isMyReaction
                  ? "bg-brand-500/30 border border-brand-500/50"
                  : count > 0
                  ? "bg-surface-elevated"
                  : "bg-surface"
              }`}
              onPress={() => react.mutate(r.value)}
              disabled={react.isPending || isOwnPost}
            >
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              {count > 0 && (
                <Text className={`text-xs font-medium ${isMyReaction ? "text-brand-300" : "text-slate-300"}`}>
                  {count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PeopleTab() {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<PeopleSection>("friends");
  const queryClient = useQueryClient();
  const tabBarPadding = useTabBarScrollPadding();

  const invalidateSocial = () => {
    queryClient.invalidateQueries({ queryKey: ["following"] });
    queryClient.invalidateQueries({ queryKey: ["followers"] });
    queryClient.invalidateQueries({ queryKey: ["follow-requests"] });
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  const { data: following = [] } = useQuery({
    queryKey: ["following"],
    queryFn: getFollowing,
  });
  const { data: followers = [] } = useQuery({
    queryKey: ["followers"],
    queryFn: getFollowers,
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["follow-requests"],
    queryFn: getFollowRequests,
  });
  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getFriends,
  });

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ["user-search", query],
    queryFn: () => searchUsers(query),
    enabled: query.length > 1,
    staleTime: 1000 * 30,
  });

  const outgoingByUser = useMemo(() => {
    const map = new Map<string, SocialConnection>();
    for (const c of following) map.set(c.following_id, c);
    return map;
  }, [following]);

  const follow = useMutation({
    mutationFn: followUser,
    onSuccess: invalidateSocial,
  });

  const unfollow = useMutation({
    mutationFn: unfollowUser,
    onSuccess: invalidateSocial,
  });

  const accept = useMutation({
    mutationFn: acceptFollowRequest,
    onSuccess: invalidateSocial,
  });

  const decline = useMutation({
    mutationFn: declineFollowRequest,
    onSuccess: invalidateSocial,
  });

  const removeFollowerMutation = useMutation({
    mutationFn: removeFollower,
    onSuccess: invalidateSocial,
  });

  const isSearching = query.length > 1;

  const sections: { id: PeopleSection; label: string; badge?: number }[] = [
    { id: "friends", label: "Friends" },
    { id: "following", label: "Following" },
    { id: "followers", label: "Followers" },
    { id: "requests", label: "Requests", badge: requests.length },
  ];

  function renderSearchAction(profile: PublicProfile) {
    const outgoing = outgoingByUser.get(profile.id);
    if (outgoing?.status === "accepted") {
      return (
        <TouchableOpacity
          className="bg-surface-elevated rounded-xl px-4 py-2"
          onPress={() => unfollow.mutate(profile.id)}
        >
          <Text className="text-slate-300 text-sm font-semibold">Following</Text>
        </TouchableOpacity>
      );
    }
    if (outgoing?.status === "pending") {
      return (
        <TouchableOpacity
          className="bg-surface-elevated rounded-xl px-4 py-2"
          onPress={() => unfollow.mutate(profile.id)}
        >
          <Text className="text-slate-400 text-sm font-semibold">Requested</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        className="bg-brand-500 rounded-xl px-4 py-2"
        onPress={() => follow.mutate(profile.id)}
      >
        <Text className="text-white text-sm font-semibold">Follow</Text>
      </TouchableOpacity>
    );
  }

  function renderListContent() {
    if (isSearching) {
      if (isFetching) {
        return <Text className="text-slate-400 text-center py-8">Searching…</Text>;
      }
      if (searchResults.length === 0) {
        return <Text className="text-slate-400 text-center py-8">No users found</Text>;
      }
      return searchResults.map((profile) => (
        <UserCard key={profile.id} profile={profile} action={renderSearchAction(profile)} />
      ));
    }

    if (section === "friends") {
      if (friends.length === 0) {
        return (
          <EmptyState
            icon="people-outline"
            title="No friends yet"
            description="Friends are people you follow who follow you back. Send a follow request and wait for them to accept."
          />
        );
      }
      return friends.map((profile) => (
        <UserCard key={profile.id} profile={profile} />
      ));
    }

    if (section === "following") {
      const accepted = following.filter((c) => c.status === "accepted");
      const pending = following.filter((c) => c.status === "pending");
      if (following.length === 0) {
        return (
          <EmptyState
            icon="search-outline"
            title="Not following anyone"
            description="Search for people above and send a follow request."
          />
        );
      }
      return (
        <>
          {pending.length > 0 ? (
            <Text className="text-slate-500 text-xs font-semibold uppercase mb-2">Pending</Text>
          ) : null}
          {pending.map((c) =>
            c.profile ? (
              <UserCard
                key={c.id}
                profile={c.profile}
                action={
                  <TouchableOpacity
                    className="bg-surface-elevated rounded-xl px-4 py-2"
                    onPress={() => unfollow.mutate(c.following_id)}
                  >
                    <Text className="text-slate-400 text-sm font-semibold">Cancel</Text>
                  </TouchableOpacity>
                }
              />
            ) : null
          )}
          {accepted.length > 0 ? (
            <Text className="text-slate-500 text-xs font-semibold uppercase mb-2 mt-2">Following</Text>
          ) : null}
          {accepted.map((c) =>
            c.profile ? (
              <UserCard
                key={c.id}
                profile={c.profile}
                action={
                  <TouchableOpacity
                    className="bg-surface-elevated rounded-xl px-4 py-2"
                    onPress={() => unfollow.mutate(c.following_id)}
                  >
                    <Text className="text-slate-300 text-sm font-semibold">Unfollow</Text>
                  </TouchableOpacity>
                }
              />
            ) : null
          )}
        </>
      );
    }

    if (section === "followers") {
      if (followers.length === 0) {
        return (
          <EmptyState
            icon="person-add-outline"
            title="No followers yet"
            description="When someone follows you and you accept their request, they'll show up here."
          />
        );
      }
      return followers.map((c) =>
        c.profile ? (
          <UserCard
            key={c.id}
            profile={c.profile}
            action={
              <TouchableOpacity
                className="bg-surface-elevated rounded-xl px-4 py-2"
                onPress={() => removeFollowerMutation.mutate(c.follower_id)}
              >
                <Text className="text-slate-400 text-sm font-semibold">Remove</Text>
              </TouchableOpacity>
            }
          />
        ) : null
      );
    }

    if (section === "requests") {
      if (requests.length === 0) {
        return (
          <EmptyState
            icon="mail-outline"
            title="No pending requests"
            description="When someone wants to follow you, you can accept or decline here."
          />
        );
      }
      return requests.map((c) =>
        c.profile ? (
          <UserCard
            key={c.id}
            profile={c.profile}
            action={
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-brand-500 rounded-xl px-3 py-2"
                  onPress={() => accept.mutate(c.id)}
                  disabled={accept.isPending || decline.isPending}
                >
                  <Text className="text-white text-sm font-semibold">Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-surface-elevated rounded-xl px-3 py-2"
                  onPress={() => decline.mutate(c.id)}
                  disabled={accept.isPending || decline.isPending}
                >
                  <Text className="text-slate-400 text-sm font-semibold">Decline</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ) : null
      );
    }

    return null;
  }

  return (
    <View className="flex-1">
      <View className="px-5 pb-3">
        <AppTextInput
          placeholder="Search by name or username…"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {!isSearching ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 12 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            alignItems: "center",
            gap: 8,
          }}
        >
          {sections.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={{ flexShrink: 0 }}
              className={`flex-row items-center rounded-full px-4 py-2.5 ${
                section === s.id ? "bg-brand-500" : "bg-surface-card"
              }`}
              onPress={() => setSection(s.id)}
            >
              <Text
                numberOfLines={1}
                className={`text-sm font-medium ${
                  section === s.id ? "text-white" : "text-slate-400"
                }`}
              >
                {s.label}
              </Text>
              {s.badge && s.badge > 0 ? (
                <View className="ml-1.5 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                  <Text className="text-white text-[10px] font-bold">{s.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        keyboardShouldPersistTaps="handled"
      >
        {renderListContent()}
      </ScrollView>
    </View>
  );
}

export default function SocialScreen() {
  const [tab, setTab] = useState<"feed" | "people">("feed");

  const refreshKeys = useMemo(() => {
    if (tab === "feed") return [["feed"]];
    return [
      ["following"],
      ["followers"],
      ["follow-requests"],
      ["friends"],
      ["user-search"],
    ];
  }, [tab]);
  const focusKeys = useMemo(
    () => [["feed"], ["following"], ["followers"], ["follow-requests"], ["friends"]] as const,
    []
  );
  const { refreshing, onRefresh } = useScreenRefresh(refreshKeys);
  useRefetchOnFocus(focusKeys);
  const tabBarPadding = useTabBarScrollPadding();

  const { data: requests = [] } = useQuery({
    queryKey: ["follow-requests"],
    queryFn: getFollowRequests,
  });

  const { data: feed = [] } = useQuery({
    queryKey: ["feed"],
    queryFn: () => getFeed(),
  });

  const pendingCount = requests.length;

  return (
    <TabSafeArea>
      <View className="px-5 pt-4 pb-3">
        <View className="mb-3">
          <Text className="text-white text-2xl font-bold tracking-tight">Social</Text>
        </View>
        <View className="flex-row bg-surface-card border border-surface-border rounded-xl p-1">
          {(["feed", "people"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              className={`flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-1.5 ${
                tab === t ? "bg-brand-500" : ""
              }`}
              onPress={() => setTab(t)}
            >
              <Text className={`font-medium text-xs capitalize ${tab === t ? "text-white" : "text-slate-400"}`}>
                {t}
              </Text>
              {t === "people" && pendingCount > 0 ? (
                <View className="bg-red-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
                  <Text className="text-white text-[9px] font-bold">{pendingCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === "people" ? (
        <PeopleTab />
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: tabBarPadding }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {feed.length === 0 ? (
            <EmptyState
              icon="newspaper-outline"
              title="No activity yet"
              description="Follow friends and accept their requests to see workouts in your feed."
              actionLabel="Find friends"
              onAction={() => setTab("people")}
            />
          ) : (
            feed.map((item) => <FeedCard key={item.id} item={item} />)
          )}
          <View className="h-8" />
        </ScrollView>
      )}
    </TabSafeArea>
  );
}
