/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./index.ts",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#FFD700",
          black: "#0A0A0A",
        },
        surface: "#121212",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 0 20px rgba(255,215,0,0.1)",
      },
      fontFamily: {
        sans: ["Inter", "Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};









