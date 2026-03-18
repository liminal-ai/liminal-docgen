import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["test/live/**/*.test.ts"],
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
