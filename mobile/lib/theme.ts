/** Chalk & Iron design tokens */
export const colors = {
  background: "#0E1113",
  surface: {
    DEFAULT: "#0E1113",
    card: "#161A1D",
    elevated: "#1E2429",
    border: "#2A3340",
  },
  brand: {
    50: "#FFF4EE",
    100: "#FFE4D1",
    200: "#FFC9A3",
    300: "#F4A575",
    400: "#E8743B",
    500: "#E8743B",
    600: "#B8592C",
    700: "#8E421F",
  },
  text: {
    primary: "#F2EFE9",
    secondary: "#A8AEB4",
    muted: "#6B7178",
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
    protein: "#D64545",
    carbs:   "#3B82C4",
    fat:     "#E0B33A",
    // bg-700 track: darkened hue-matched shade, visible against card bg at 0%
    track: {
      protein: "#7B1D1D",
      carbs:   "#1E3F7A",
      fat:     "#7A520F",
    },
  },
  white: "#FFFFFF",
  shadow: "#000000",
  accentWash: "rgba(232,116,59,0.12)",
} as const;

export const fontSize = {
  displayXL: 48,
  displayL: 32,
  heading: 22,
  body: 16,
  label: 13,
  caption: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 20,
  pill: 999,
} as const;
