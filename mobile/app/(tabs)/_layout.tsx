import { Tabs, Redirect, router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores/authStore";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { getGoal } from "@/lib/api";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { colors } from "@/lib/theme";
import { useIsMainTab } from "@/hooks/useIsMainTab";
import { TOUR_SEEN_KEY } from "@/app/tour";

export default function TabsLayout() {
  const { session, isLoading } = useAuthStore();
  const [fontsLoaded] = useFonts(Ionicons.font);
  const { data: goal, isLoading: goalLoading } = useQuery({
    queryKey: ["goal"],
    queryFn: getGoal,
    enabled: !!session,
  });
  useOfflineSync();
  const isMainTab = useIsMainTab();

  useEffect(() => {
    if (!session) return;
    AsyncStorage.getItem(TOUR_SEEN_KEY).then((seen) => {
      if (!seen) router.push("/tour");
    });
  }, [session]);

  if (!fontsLoaded || isLoading || (session && goalLoading)) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!goal) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return (
    <View style={{ flex: 1 }}>
    <OfflineBanner />
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      tabBar={(props) => (isMainTab ? <FloatingTabBar {...props} /> : null)}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 0,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen name="home/index" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="workouts/index" />
      <Tabs.Screen name="social/index" />
      <Tabs.Screen name="progress/index" />
      <Tabs.Screen name="workouts/templates" options={{ href: null }} />
      <Tabs.Screen name="workouts/create-template" options={{ href: null }} />
      <Tabs.Screen name="workouts/session-detail" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ href: null }} />
    </Tabs>
    </View>
  );
}
