import type { ReactNode } from "react";
import { View, Text, type ViewProps } from "react-native";

type CardProps = ViewProps & {
  children: ReactNode;
  padded?: boolean;
  className?: string;
};

export function Card({ children, padded = true, className = "", ...props }: CardProps) {
  return (
    <View
      className={`bg-surface-card rounded-xl border border-surface-border ${padded ? "p-4" : ""} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`px-5 ${className}`}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="text-white font-semibold text-base mb-3">{children}</Text>;
}
