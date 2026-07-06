import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { colors } from "@/lib/theme";

type FinishWorkoutModalProps = {
  visible: boolean;
  workoutName: string;
  saving?: boolean;
  onClose: () => void;
  onFinish: (shareToFeed: boolean) => void;
};

export function FinishWorkoutModal({
  visible,
  workoutName,
  saving = false,
  onClose,
  onFinish,
}: FinishWorkoutModalProps) {
  const [shareToFeed, setShareToFeed] = useState(false);

  useEffect(() => {
    if (visible) setShareToFeed(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1 bg-black/60 justify-end"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View className="bg-surface-card rounded-t-3xl p-5 border-t border-surface-elevated">
            <Text className="text-white text-lg font-bold mb-1">Finish workout?</Text>
            <Text className="text-slate-400 text-sm mb-4">
              This will save &quot;{workoutName}&quot; to your history.
            </Text>

            <View className="flex-row items-center justify-between bg-surface rounded-xl px-4 py-3.5 mb-5">
              <View className="flex-1 pr-3">
                <Text className="text-white font-medium">Share to feed</Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  Let friends see this workout when they view your activity
                </Text>
              </View>
              <Switch
                value={shareToFeed}
                onValueChange={setShareToFeed}
                trackColor={{ false: colors.surface.elevated, true: colors.brand[500] }}
                thumbColor={colors.white}
                disabled={saving}
              />
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
                className="flex-1 bg-green-500 rounded-xl py-3 items-center"
                onPress={() => onFinish(shareToFeed)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-white font-semibold">Finish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
