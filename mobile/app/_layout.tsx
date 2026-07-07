import "../global.css";
import { useEffect } from "react";
import { Alert, Stack, router } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/authStore";
import { getGoal, syncRevenueCatPremium } from "@/lib/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { captureError, initErrorReporting } from "@/lib/errorReporting";
import { initPurchases } from "@/lib/purchases";
import { NavigationHistoryTracker } from "@/components/NavigationHistoryTracker";

async function handleAuthDeepLink(url: string) {
  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code as string | undefined;
  const type = queryParams?.type as string | undefined;
  if (!code) return;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    captureError(error, { scope: "auth-deep-link" });
    Alert.alert("Sign-in failed", error.message);
    router.replace("/(auth)/login");
    return;
  }

  if (type === "recovery") {
    router.replace("/(auth)/reset-password");
    return;
  }

  try {
    const goal = await getGoal();
    router.replace(goal ? "/(tabs)/home" : "/(auth)/onboarding");
  } catch (err) {
    captureError(err, { scope: "auth-deep-link-goal" });
    router.replace("/(tabs)/home");
  }
}

async function onAuthenticated(userId: string) {
  await initPurchases(userId);
  syncRevenueCatPremium()
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["rc-premium"] });
    })
    .catch((error) => captureError(error, { scope: "sync-revenuecat-premium-login" }));
}

export default function RootLayout() {
  const { setSession } = useAuthStore();

  useEffect(() => {
    initErrorReporting();

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session?.user?.id) {
          onAuthenticated(session.user.id).catch((error) =>
            captureError(error, { scope: "init-purchases" })
          );
        }
      })
      .catch((error) => {
        captureError(error, { scope: "auth-get-session" });
        setSession(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === "PASSWORD_RECOVERY") {
          router.replace("/(auth)/reset-password");
          return;
        }
        if (session?.user?.id) {
          onAuthenticated(session.user.id).catch((error) =>
            captureError(error, { scope: "init-purchases" })
          );
        }
      }
    );

    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      handleAuthDeepLink(url);
    });

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, [setSession]);

  return (
    <GestureHandlerRootView className="flex-1">
      <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <NavigationHistoryTracker />
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chat/index"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="workout-session/index"
            options={{ presentation: "fullScreenModal", headerShown: false }}
          />
          <Stack.Screen
            name="paywall"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="tour"
            options={{ presentation: "fullScreenModal", headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
          <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
