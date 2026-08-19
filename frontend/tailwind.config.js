/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // App (dark workspace) palette
        ink: "#14120F",
        surface: "#1C1915",
        line: "#322D25",
        text: "#EDE6D8",
        "text-muted": "#8C8577",
        accent: "#C9962C",
        success: "#6B8F71",
        danger: "#B85C4A",

        // Portfolio (paper surface) palette
        paper: "#EFE7D8",
        "paper-raised": "#F7F2E7",
        "ink-on-paper": "#221F1A",
        rule: "#D8CBAE",
      },
      transitionDuration: {
        120: "120ms",
        150: "150ms",
        400: "400ms",
      },
    },
  },
  plugins: [],
};
