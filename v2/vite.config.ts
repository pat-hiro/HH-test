import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// v2 builds as a separate app under /HH-test/v2/ on GitHub Pages.
// Local dev runs at the root, base="./" makes both work.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
