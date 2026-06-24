/** Clean Performance design tokens — Direction B */
export const colors = {
  background: "#0B0F14",
  surface: {
    DEFAULT: "#0B0F14",
    card: "#151A22",
    elevated: "#1F2630",
    border: "#2A3340",
  },
  brand: {
    50: "#FFF7ED",
    100: "#FFEDD5",
    200: "#FED7AA",
    300: "#FDBA74",
    400: "#FB923C",
    500: "#F97316",
    600: "#EA580C",
    700: "#C2410C",
  },
  text: {
    primary: "#F8FAFC",
    secondary: "#94A3B8",
    muted: "#64748B",
  },
  success: "#84CC16",
  info: "#38BDF8",
  danger: "#EF4444",
  meal: {
    breakfast: "#FBBF24",
    lunch: "#38BDF8",
    dinner: "#A78BFA",
    snack: "#4ADE80",
  },
  macro: {
    protein: "#FB923C",
    carbs: "#FBBF24",
    fat: "#F87171",
  },
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;
