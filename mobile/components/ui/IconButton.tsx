import { TouchableOpacity, View, type TouchableOpacityProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type IconButtonProps = TouchableOpacityProps & {
  icon: IoniconsName;
  size?: number;
  variant?: "default" | "accent";
};

export function IconButton({
  icon,
  size = 20,
  variant = "default",
  className = "",
  ...props
}: IconButtonProps) {
  const iconColor = variant === "accent" ? colors.brand[400] : colors.text.secondary;

  return (
    <TouchableOpacity
      className={`bg-surface-card border border-surface-border rounded-full p-3 ${className}`}
      activeOpacity={0.75}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      {...props}
    >
      <Ionicons name={icon} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

export function MealDot({ color }: { color: string }) {
  return (
    <View
      style={{ backgroundColor: color }}
      className="w-2 h-2 rounded-full"
    />
  );
}
