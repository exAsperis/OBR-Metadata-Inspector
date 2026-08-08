import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { cors: { origin: "https://www.owlbear.rodeo" } },
  test: { environment: "jsdom", globals: true },
});
