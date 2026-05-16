import { defineConfig } from "orval";

export default defineConfig({
  flavortown: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/ft.zod.new.ts",
    },
    input: {
      target: "./specs/flavortown.yaml"
    },
  },
  vikunja: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/vk.zod.new.ts",
    },
    input: {
      target: "./specs/docs.json",
    },
  },
  bugsink: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/bs.zod.new.ts",
    },
    input: {
      target: "./specs/bugsink.yaml",
    },
  },
  hcbscan: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/hcbscan.zod.new.ts",
    },
    input: {
      target: "./specs/hcbscan.yaml",
    },
  },
  hcb: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/hcb.zod.new.ts",
    },
    input: {
      target: "./specs/hcb.json",
    },
  },
});
