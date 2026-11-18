import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the React Server bundle; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Simulation scenarios replay weeks of 10-minute worker runs; give them room on slow CI machines.
    testTimeout: 60_000,
    // Fixed zone so date maths is deterministic regardless of the machine running the tests.
    env: { TZ: "UTC" },
  },
});
