import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type QueryKey = readonly unknown[];

export function useScreenRefresh(queryKeys: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        keysRef.current.map((queryKey) =>
          queryClient.refetchQueries({ queryKey: queryKey as string[] })
        )
      );
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, onRefresh };
}
