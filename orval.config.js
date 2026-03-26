import { defineConfig } from "orval";

export default defineConfig({
  flavortown: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/ft.zod.ts",
    },
    input: {
      target: "./flavortown.yaml"
    },
  },
  vikunja: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/vk.zod.ts",
    },
    input: {
      target: "./docs.json",
    },
  },
  bugsink: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/bs.zod.ts",
    },
    input: {
      target: "./bugsink.yaml",
    },
  },
});
