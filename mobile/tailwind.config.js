/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF4EE",
          100: "#FFE4D1",
          200: "#FFC9A3",
          300: "#F4A575",
          400: "#E8743B",
          500: "#E8743B",
          600: "#B8592C",
          700: "#8E421F",
          800: "#6B3018",
          900: "#4A2010",
        },
        surface: {
          DEFAULT: "#0E1113",
          card: "#161A1D",
          elevated: "#1E2429",
          border: "#2A3340",
        },
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
