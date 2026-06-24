import type { ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { useAppBack } from "@/hooks/useAppBack";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  showBack?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  showBack = true,
}: ScreenHeaderProps) {
  const appBack = useAppBack();

  return (
    <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
      <View className="flex-row items-center flex-1">
        {showBack ? (
          <TouchableOpacity
            onPress={onBack ?? appBack}
            className="mr-3 p-1"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
        ) : null}
        <View className="flex-1">
          <Text className="text-white text-xl font-bold" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-slate-400 text-sm mt-0.5" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}
