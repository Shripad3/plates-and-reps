import { View, Text } from "react-native";
import { colors } from "@/lib/theme";
import { APP_NAME } from "@/constants";

type AppLogoProps = {
  size?: "sm" | "lg";
};

export function AppLogo({ size = "lg" }: AppLogoProps) {
  const markSize = size === "lg" ? 52 : 40;
  const titleClass = size === "lg" ? "text-2xl" : "text-xl";

  return (
    <View className="items-center">
      <View
        style={{
          width: markSize,
          height: markSize,
          backgroundColor: colors.brand[500],
        }}
        className="rounded-2xl items-center justify-center mb-4"
      >
        <Text className="text-white font-bold" style={{ fontSize: markSize * 0.38 }}>
          P
        </Text>
      </View>
      <Text className={`text-white font-bold ${titleClass} tracking-tight`}>{APP_NAME}</Text>
    </View>
  );
}
