import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  type KeyboardTypeOptions,
} from "react-native";
import { AppTextInput } from "@/components/AppTextInput";
import { AnimatedKeyboardAvoidingView } from "@/components/AnimatedKeyboardAvoidingView";

type EditValueModalProps = {
  visible: boolean;
  title: string;
  label: string;
  unit: string;
  initialValue: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  saving?: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
};

export function EditValueModal({
  visible,
  title,
  label,
  unit,
  initialValue,
  placeholder,
  keyboardType = "decimal-pad",
  saving = false,
  onClose,
  onSave,
}: EditValueModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 bg-black/60 justify-end"
        activeOpacity={1}
        onPress={onClose}
      >
        <AnimatedKeyboardAvoidingView enabled={visible}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View className="bg-surface-card rounded-t-3xl p-5 border-t border-surface-elevated">
              <Text className="text-white text-lg font-bold mb-1">{title}</Text>
              <Text className="text-slate-400 text-sm mb-4">{label}</Text>

              <View className="flex-row items-center gap-3 mb-5">
                <AppTextInput
                  className="flex-1 bg-surface-elevated text-white rounded-xl"
                  keyboardType={keyboardType}
                  placeholder={placeholder}
                  value={value}
                  onChangeText={setValue}
                  autoFocus
                />
                {unit ? <Text className="text-slate-400">{unit}</Text> : null}
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 bg-surface-elevated rounded-xl py-3 items-center"
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text className="text-slate-300 font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-brand-500 rounded-xl py-3 items-center"
                  onPress={() => onSave(value)}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text className="text-white font-semibold">Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </AnimatedKeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
