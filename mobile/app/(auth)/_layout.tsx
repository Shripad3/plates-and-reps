import { Stack, Redirect, useSegments } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuthStore } from "@/stores/authStore";
import { colors } from "@/lib/theme";

export default function AuthLayout() {
  const { session, isLoading } = useAuthStore();
  const segments = useSegments();
  const current = segments[segments.length - 1];
  const onOnboarding = current === "onboarding";
  const onResetPassword = current === "reset-password";

  if (isLoading) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  // Allow authenticated users to finish onboarding or reset password from email link
  if (session && !onOnboarding && !onResetPassword) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
