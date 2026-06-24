import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
};

type EditPickerModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: PickerOption[];
  selectedValue: string | null;
  saving?: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
};

export function EditPickerModal({
  visible,
  title,
  subtitle,
  options,
  selectedValue,
  saving = false,
  onClose,
  onSelect,
}: EditPickerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View
          className="bg-surface rounded-t-3xl border-t border-surface-elevated"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-white text-lg font-bold">{title}</Text>
              {subtitle ? (
                <Text className="text-slate-400 text-sm mt-0.5">{subtitle}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text className="text-brand-400 font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>

          {saving ? (
            <ActivityIndicator color={colors.brand[400]} className="py-8" />
          ) : (
            <ScrollView className="max-h-96 px-5" keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <TouchableOpacity
                    key={option.value}
                    className={`rounded-xl p-4 mb-2 border ${
                      selected
                        ? "bg-brand-500/20 border-brand-500"
                        : "bg-surface-card border-surface-elevated"
                    }`}
                    onPress={() => onSelect(option.value)}
                  >
                    <Text
                      className={`font-semibold text-base ${
                        selected ? "text-brand-400" : "text-white"
                      }`}
                    >
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text className="text-slate-400 text-sm mt-0.5">{option.description}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              <View className="h-2" />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
