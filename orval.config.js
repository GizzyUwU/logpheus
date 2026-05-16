import { defineConfig } from "orval";

export default defineConfig({
  flavortown: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/ft.zod.new.ts",
    },
    input: {
      target: "./flavortown.yaml"
    },
  },
  vikunja: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/vk.zod.new.ts",
    },
    input: {
      target: "./docs.json",
    },
  },
  bugsink: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/bs.zod.new.ts",
    },
    input: {
      target: "./bugsink.yaml",
    },
  },
  hcbscan: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/hcbscan.zod.new.ts",
    },
    input: {
      target: "./hcbscan.yaml",
    },
  },
});
