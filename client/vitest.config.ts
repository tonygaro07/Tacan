import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    pool: "threads",
  },
});
