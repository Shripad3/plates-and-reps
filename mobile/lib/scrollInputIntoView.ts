import type { RefObject } from "react";
import type { ScrollView } from "react-native";

export function scrollInputIntoView(
  scrollRef: RefObject<ScrollView | null>,
  nativeTarget: number
) {
  const scrollView = scrollRef.current;
  if (!scrollView) return;

  const responder = scrollView.getScrollResponder?.();
  if (
    responder &&
    "scrollResponderScrollNativeHandleToKeyboard" in responder &&
    typeof responder.scrollResponderScrollNativeHandleToKeyboard === "function"
  ) {
    responder.scrollResponderScrollNativeHandleToKeyboard(nativeTarget, 48, true);
  }
}
