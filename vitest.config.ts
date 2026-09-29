import { defineConfig } from "vitest/config";

export default defineConfig({
  // .test.tsx files opt into jsdom with a `// @vitest-environment jsdom` docblock; the rest run in node.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
