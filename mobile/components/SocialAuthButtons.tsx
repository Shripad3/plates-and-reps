import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Ionicons } from "@expo/vector-icons";
import { signInWithApple, signInWithGoogle, isAppleAuthAvailable } from "@/lib/socialAuth";
import { colors } from "@/lib/theme";

type Props = {
  /** Return false to cancel sign-in before it starts (e.g. for age-gate validation). */
  onBeforeSignIn?: () => boolean;
};

export function SocialAuthButtons({ onBeforeSignIn }: Props) {
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const busy = loadingApple || loadingGoogle;

  async function handleApple() {
    if (onBeforeSignIn && !onBeforeSignIn()) return;
    setLoadingApple(true);
    const { error } = await signInWithApple();
    setLoadingApple(false);
    if (error) Alert.alert("Sign in failed", error);
  }

  async function handleGoogle() {
    if (onBeforeSignIn && !onBeforeSignIn()) return;
    setLoadingGoogle(true);
    const { error } = await signInWithGoogle();
    setLoadingGoogle(false);
    if (error) Alert.alert("Sign in failed", error);
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 h-px bg-surface-border" />
        <Text className="text-slate-500 text-xs">or continue with</Text>
        <View className="flex-1 h-px bg-surface-border" />
      </View>

      {isAppleAuthAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          style={{ height: 50, opacity: busy && !loadingApple ? 0.4 : 1 }}
          onPress={handleApple}
        />
      )}

      <TouchableOpacity
        className="flex-row items-center justify-center gap-2.5 bg-surface-card border border-surface-border rounded-xl"
        style={{ height: 50, opacity: busy && !loadingGoogle ? 0.4 : 1 }}
        onPress={handleGoogle}
        disabled={busy}
        activeOpacity={0.75}
      >
        {loadingGoogle ? (
          <ActivityIndicator size="small" color={colors.text.secondary} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#fff" />
            <Text className="text-white font-medium text-sm">Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
