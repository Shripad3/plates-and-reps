import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

function navigateAfterOAuthSignIn(createdAt: string) {
  // New users (account created in the last 60s) need onboarding;
  // existing users get redirected to home by AuthLayout automatically.
  const isNewUser = Date.now() - new Date(createdAt).getTime() < 60_000;
  if (isNewUser) {
    router.replace("/(auth)/onboarding");
  }
}

export async function signInWithApple(): Promise<{ error?: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: "Apple Sign In failed: no identity token received." };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });

    if (error) return { error: error.message };
    if (data.session) navigateAfterOAuthSignIn(data.session.user.created_at);

    return {};
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      return {}; // user dismissed the sheet — silent
    }
    return { error: err instanceof Error ? err.message : "Apple Sign In failed." };
  }
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  try {
    const redirectTo = Linking.createURL("/auth/callback");

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (oauthError || !data.url) {
      return { error: oauthError?.message ?? "Could not start Google Sign In." };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success") return {}; // cancelled — silent

    const { queryParams } = Linking.parse(result.url);
    const code = queryParams?.code as string | undefined;

    if (!code) {
      return { error: "Google Sign In failed: no auth code in redirect." };
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) return { error: sessionError.message };
    if (sessionData.session) {
      navigateAfterOAuthSignIn(sessionData.session.user.created_at);
    }

    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Google Sign In failed." };
  }
}

// Apple Sign In is only available on iOS physical devices running iOS 13+.
export const isAppleAuthAvailable =
  Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 13;
