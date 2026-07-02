import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Colyseus test server holds sockets — run files serially
    fileParallelism: false,
    pool: "threads",
  },
});
