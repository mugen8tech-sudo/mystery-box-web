import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        panelBg: "#050814",
        memberBg: "#070b1c",
        panelAccent: "#22d3ee",
        memberAccent: "#a855f7"
      }
    }
  },
  plugins: []
};

export default config;
