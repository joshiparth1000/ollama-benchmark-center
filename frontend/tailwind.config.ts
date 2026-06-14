import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        panel: "#171d22",
        line: "#2a333a",
        accent: "#40b37c",
        warn: "#e7b84d"
      }
    }
  },
  plugins: []
} satisfies Config;
