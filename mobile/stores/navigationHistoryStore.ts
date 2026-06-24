import { create } from "zustand";
import { normalizeRouteKey } from "@/lib/navigationHistory";

interface NavigationHistoryState {
  stack: string[];
  push: (route: string) => void;
  pop: (currentRoute: string) => string | null;
  reset: (route: string) => void;
}

export const useNavigationHistoryStore = create<NavigationHistoryState>((set, get) => ({
  stack: [],

  push: (route) =>
    set((state) => {
      const normalized = normalizeRouteKey(route);
      if (state.stack[state.stack.length - 1] === normalized) return state;

      const existingIdx = state.stack.lastIndexOf(normalized);
      if (existingIdx !== -1) {
        return { stack: state.stack.slice(0, existingIdx + 1) };
      }

      return { stack: [...state.stack, normalized] };
    }),

  pop: (currentRoute) => {
    const { stack } = get();
    if (stack.length <= 1) return null;

    const normalized = normalizeRouteKey(currentRoute);
    let idx = stack.lastIndexOf(normalized);
    if (idx === -1) idx = stack.length - 1;
    if (idx <= 0) return null;

    const previous = stack[idx - 1];
    set({ stack: stack.slice(0, idx) });
    return previous;
  },

  reset: (route) => set({ stack: [normalizeRouteKey(route)] }),
}));
