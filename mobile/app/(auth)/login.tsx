import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { AppTextInput } from "@/components/AppTextInput";
import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/Button";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) Alert.alert("Login failed", error.message);
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Enter your email", "Type the email for your account, then tap Forgot password again.");
      return;
    }

    setIsResetting(true);
    const redirectTo = Linking.createURL("/auth/callback", {
      queryParams: { type: "recovery" },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
    setIsResetting(false);

    if (error) {
      Alert.alert("Could not send reset email", error.message);
      return;
    }

    Alert.alert(
      "Check your email",
      "We sent a password reset link. Open it on this device to choose a new password."
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="flex-grow px-6 justify-center py-12"
      >
        <View className="mb-10 items-center">
          <AppLogo />
          <Text className="text-slate-400 text-base text-center mt-4 leading-6">
            Nutrition and training, tracked with clarity.
          </Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="text-slate-400 text-sm mb-1.5">Email</Text>
            <AppTextInput
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View>
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-slate-400 text-sm">Password</Text>
              <TouchableOpacity onPress={handleForgotPassword} disabled={isResetting}>
                <Text className="text-brand-400 text-sm font-medium">
                  {isResetting ? "Sending…" : "Forgot password?"}
                </Text>
              </TouchableOpacity>
            </View>
            <AppTextInput
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <Button
            label={isLoading ? "Signing in…" : "Sign in"}
            onPress={handleLogin}
            loading={isLoading}
            fullWidth
            className="mt-2"
          />
        </View>

        <View className="mt-8 gap-6">
          <SocialAuthButtons />

          <View className="items-center">
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text className="text-slate-400">
                  New here?{" "}
                  <Text className="text-brand-400 font-semibold">Create account</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
