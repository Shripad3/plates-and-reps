import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { useLogWater } from "@/hooks/useNutrition";
import { colors } from "@/lib/theme";

type WaterWidgetProps = {
  date: string;
  water_ml: number;
  target_ml: number;
  /** tile — standalone card cell (Home). compact — inline row inside a card (Nutrition). */
  variant?: "tile" | "compact";
};

export function WaterWidget({
  date,
  water_ml,
  target_ml,
  variant = "tile",
}: WaterWidgetProps) {
  const logWater = useLogWater();
  const pct = Math.min((water_ml / target_ml) * 100, 100);
  const displayL = (Math.round(water_ml / 100) / 10).toFixed(1);
  const targetL = (target_ml / 1000).toFixed(1);

  function add(ml: number) {
    logWater.mutate({ date, amount_ml: ml });
  }

  if (variant === "compact") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 16,
          marginTop: 16,
          borderTopWidth: 1,
          borderTopColor: colors.surface.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="water-outline" size={16} color={colors.info} />
          <Text style={{ fontSize: 13, color: colors.text.secondary }}>
            {displayL}L water
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            style={{
              backgroundColor: colors.surface.elevated,
              borderRadius: 8,
              padding: 6,
              opacity: water_ml <= 0 ? 0.35 : 1,
            }}
            disabled={water_ml <= 0}
            onPress={() => add(-Math.min(250, water_ml))}
          >
            <Ionicons name="remove" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
          {[250, 500].map((ml) => (
            <TouchableOpacity
              key={ml}
              style={{
                backgroundColor: colors.surface.elevated,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
              onPress={() => add(ml)}
            >
              <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: "600" }}>
                +{ml}ml
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // tile variant — standalone card
  return (
    <Card variant="tile" style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text.primary }}>Water</Text>
        <Text style={{ fontSize: 12, color: colors.text.muted }}>
          {displayL}L / {targetL}L
        </Text>
      </View>
      <View
        style={{
          height: 6,
          backgroundColor: colors.surface.elevated,
          borderRadius: 99,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: colors.info,
            borderRadius: 99,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {[250, 500].map((ml) => (
          <TouchableOpacity
            key={ml}
            style={{
              backgroundColor: colors.surface.elevated,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
            onPress={() => add(ml)}
          >
            <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: "600" }}>
              +{ml}ml
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}
