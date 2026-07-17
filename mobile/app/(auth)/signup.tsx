import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { AppTextInput } from "@/components/AppTextInput";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors } from "@/lib/theme";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { KeyboardAwareScreen } from "@/components/KeyboardAwareScreen";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleSignup() {
    if (!email || !password || !displayName) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }
    if (displayName.trim().length > 50) {
      Alert.alert("Error", "Name must be 50 characters or fewer.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters.");
      return;
    }
    if (!isAdult) {
      Alert.alert(
        "Age requirement",
        "You must be at least 13 years old to create an account."
      );
      return;
    }

    setIsLoading(true);
    const redirectTo = Linking.createURL("/auth/callback");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: redirectTo,
      },
    });
    setIsLoading(false);

    if (error) {
      Alert.alert("Signup failed", error.message);
      return;
    }

    if (data.session) {
      router.replace("/(auth)/onboarding");
    } else {
      Alert.alert(
        "Check your email",
        "We sent a confirmation link. Click it to activate your account."
      );
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScreenHeader title="Create account" subtitle="Set up your profile" showBack={false} />
      <KeyboardAwareScreen
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 }}
      >
        <View className="gap-4 mt-2">
          <View>
            <Text className="text-slate-400 text-sm mb-1.5">Name</Text>
            <AppTextInput placeholder="Your name" value={displayName} onChangeText={setDisplayName} />
          </View>

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
            <Text className="text-slate-400 text-sm mb-1.5">Password</Text>
            <AppTextInput
              placeholder="Min. 8 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View className="flex-row items-center justify-between bg-surface-card rounded-xl px-4 py-3.5">
            <View className="flex-1 pr-3">
              <Text className="text-white font-medium">I'm at least 13 years old</Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                Required to create an account
              </Text>
            </View>
            <Switch
              value={isAdult}
              onValueChange={setIsAdult}
              trackColor={{ false: colors.surface.elevated, true: colors.brand[500] }}
              thumbColor={colors.white}
            />
          </View>

          <Button
            label={isLoading ? "Creating account…" : "Create account"}
            onPress={handleSignup}
            loading={isLoading}
            fullWidth
            className="mt-2"
          />
        </View>

        <View className="mt-8 gap-6">
          <SocialAuthButtons
            onBeforeSignIn={() => {
              if (!isAdult) {
                Alert.alert(
                  "Age requirement",
                  "You must be at least 13 years old to create an account."
                );
                return false;
              }
              return true;
            }}
          />

          <View className="items-center">
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-slate-400">
                  Already have an account?{" "}
                  <Text className="text-brand-400 font-semibold">Sign in</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}
