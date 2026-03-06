import { defineConfig } from "orval";

export default defineConfig({
  flavortown: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/ft.zod.ts",
    },
    input: {
      target: "./api-1.yaml",
    },
  },
});
