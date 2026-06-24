import { useMemo, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useExerciseSearch, useCreateExercise } from "@/hooks/useWorkouts";
import { hasExactExerciseMatch } from "@/lib/exerciseSearch";
import type { Exercise } from "@/types";
import { AppTextInput } from "@/components/AppTextInput";
import { colors } from "@/lib/theme";

const SEARCH_BAR_HEIGHT = 76;

interface ExercisePickerProps {
  visible: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export function ExercisePicker({
  visible,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: ExercisePickerProps) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { data: results = [], isLoading } = useExerciseSearch(query, undefined, visible);
  const createExercise = useCreateExercise();

  const trimmedQuery = query.trim();
  const showCreateOption = useMemo(() => {
    if (trimmedQuery.length < 2) return false;
    return !hasExactExerciseMatch(trimmedQuery, results);
  }, [trimmedQuery, results]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  async function handleCreateCustom() {
    if (!trimmedQuery) return;

    try {
      const exercise = await createExercise.mutateAsync({ name: trimmedQuery });
      onSelect(exercise);
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    }
  }

  const searchBarOffset = keyboardHeight > 0 ? keyboardHeight : insets.bottom;
  const listBottomInset = SEARCH_BAR_HEIGHT + searchBarOffset;

  const listFooter = showCreateOption ? (
    <View className="pt-2 pb-4">
      <TouchableOpacity
        className="bg-brand-500/15 border border-brand-500/40 rounded-xl py-3 px-4"
        onPress={handleCreateCustom}
        disabled={createExercise.isPending}
      >
        <Text className="text-brand-300 font-medium text-center">
          {createExercise.isPending
            ? "Adding exercise…"
            : `+ Add "${trimmedQuery}" to library`}
        </Text>
        <Text className="text-slate-500 text-xs text-center mt-1">
          Saves for future searches
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <View className="px-5 pb-3 flex-row items-center justify-between border-b border-surface-elevated">
          <Text className="text-white text-lg font-semibold">Add Exercise</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text className="text-brand-400 text-base font-medium">Cancel</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.brand[400]} className="py-8" />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            className="flex-1 px-5"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: listBottomInset }}
            ListEmptyComponent={
              trimmedQuery ? (
                <Text className="text-slate-500 text-sm text-center py-6">
                  No exercises found
                </Text>
              ) : (
                <Text className="text-slate-500 text-sm text-center py-6">
                  Start typing to search the exercise library
                </Text>
              )
            }
            ListFooterComponent={listFooter}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="py-3.5 border-b border-surface-elevated"
                onPress={() => onSelect(item)}
              >
                <Text className="text-white text-base">{item.name}</Text>
                {item.muscle_groups.length > 0 && (
                  <Text className="text-slate-500 text-xs mt-0.5">
                    {item.muscle_groups.join(", ")}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}

        <View
          className="absolute left-0 right-0 px-5 pt-3 border-t border-surface-elevated bg-surface"
          style={{
            bottom: searchBarOffset,
            paddingBottom: keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 12),
          }}
        >
          <AppTextInput
            className="bg-surface-elevated text-white rounded-xl"
            placeholder="Search exercises…"
            value={query}
            onChangeText={onQueryChange}
            autoFocus={visible}
            returnKeyType="search"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
