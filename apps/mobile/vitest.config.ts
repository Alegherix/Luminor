import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: /^@luminor\/contracts$/,
        replacement: path.resolve(import.meta.dirname, "../../packages/contracts/src/index.ts"),
      },
      {
        find: /^@luminor\/shared\/(.*)$/,
        replacement: `${path.resolve(import.meta.dirname, "../../packages/shared/src")}/$1.ts`,
      },
    ],
  },
});
