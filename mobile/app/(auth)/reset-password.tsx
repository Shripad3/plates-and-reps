import { useState } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { AppTextInput } from "@/components/AppTextInput";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSave() {
    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Make sure both fields match.");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      Alert.alert("Could not update password", error.message);
      return;
    }

    Alert.alert("Password updated", "You can now use your new password to sign in.", [
      { text: "OK", onPress: () => router.replace("/(tabs)/home") },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScreenHeader title="New password" subtitle="Choose a new password for your account" showBack={false} />
      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="pt-4 pb-12"
      >
        <View className="gap-4">
          <View>
            <Text className="text-slate-400 text-sm mb-1.5">New password</Text>
            <AppTextInput
              placeholder="Min. 8 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
          <View>
            <Text className="text-slate-400 text-sm mb-1.5">Confirm password</Text>
            <AppTextInput
              placeholder="Repeat password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
          <Button
            label={isLoading ? "Saving…" : "Update password"}
            onPress={handleSave}
            loading={isLoading}
            fullWidth
            className="mt-2"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
