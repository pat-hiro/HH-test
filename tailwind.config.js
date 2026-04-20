/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          900: "#0b3d2e",
          800: "#0f4a38",
          700: "#136046",
        },
      },
    },
  },
  plugins: [],
};
