import type { ReactNode } from "react";
import { Alert, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";

type SwipeToDeleteRowProps = {
  children: ReactNode;
  title: string;
  onDelete: () => void;
};

export function SwipeToDeleteRow({ children, title, onDelete }: SwipeToDeleteRowProps) {
  function confirmDelete() {
    Alert.alert("Delete entry?", title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  }

  function renderRightActions() {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={confirmDelete}
        activeOpacity={0.85}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.deleteLabel}>Delete</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        {children}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 6,
  },
  deleteAction: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    gap: 4,
  },
  deleteLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});
