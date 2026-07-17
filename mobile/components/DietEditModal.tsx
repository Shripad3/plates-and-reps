import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "@/lib/api";
import { DietForm } from "@/components/DietForm";
import type { DietInfo } from "@/lib/mealPlan";

/** Edit dietary pattern + allergies from Settings (the only place after onboarding). */
export function DietEditModal({
  visible,
  initial,
  onClose,
}: {
  visible: boolean;
  initial: DietInfo | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function save(info: DietInfo) {
    setSaving(true);
    try {
      await updateProfile({ diet_info: info });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      onClose();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-surface">
        <View className="px-5 pt-2 pb-3 flex-row items-center justify-between border-b border-surface-border">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-brand-400 text-base">Close</Text>
          </TouchableOpacity>
          <Text className="text-white font-semibold text-base">Dietary preferences</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingVertical: 20, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <DietForm initial={initial} saveLabel="Save" submitting={saving} onSubmit={save} onSkip={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
