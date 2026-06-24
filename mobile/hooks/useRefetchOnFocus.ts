import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";

type QueryKey = readonly unknown[];

/** Refetch stale data when the screen gains focus (e.g. after AI chat updates). */
export function useRefetchOnFocus(queryKeys: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useFocusEffect(
    useCallback(() => {
      keysRef.current.forEach((queryKey) => {
        void queryClient.refetchQueries({
          queryKey: queryKey as string[],
          type: "active",
          stale: true,
        });
      });
    }, [queryClient])
  );
}
