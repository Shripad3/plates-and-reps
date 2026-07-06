import { TouchableOpacity, Text, ActivityIndicator, type TouchableOpacityProps } from "react-native";
import { colors } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = TouchableOpacityProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

/**
 * Three-tier button system (Section 6):
 *   primary   — brand fill, white text
 *   secondary — transparent, brand border + brand text
 *   ghost     — no fill, no border, brand text (link-style)
 *   danger    — red tint (destructive actions)
 */
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand-500",
  secondary: "border border-brand-500/50",
  ghost: "",
  danger: "bg-red-500/15",
};

const VARIANT_TEXT: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-brand-400",
  ghost: "text-brand-400",
  danger: "text-red-400",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-3 py-2 rounded-lg",
  md: "px-5 py-3 rounded-xl",
  lg: "px-6 py-4 rounded-xl",
};

const SIZE_TEXT: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-base",
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      className={`items-center justify-center ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${
        fullWidth ? "w-full" : ""
      } ${isDisabled ? "opacity-50" : ""} ${className}`}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.brand[400]} />
      ) : (
        <Text className={`font-semibold ${VARIANT_TEXT[variant]} ${SIZE_TEXT[size]}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
