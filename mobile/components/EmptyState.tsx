import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type EmptyStateProps = {
  icon?: IoniconsName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function EmptyState({
  icon = "ellipse-outline",
  title,
  description,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <View className="items-center py-12 px-4">
      <View className="w-14 h-14 rounded-2xl bg-surface-elevated border border-surface-border items-center justify-center mb-4">
        <Ionicons name={icon} size={26} color={colors.brand[400]} />
      </View>
      <Text className="text-white text-lg font-semibold mb-2 text-center">{title}</Text>
      {description ? (
        <Text className="text-slate-400 text-sm text-center mb-6 leading-5">{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" />
      ) : null}
      {children}
    </View>
  );
}
