import { defineConfig } from "orval";

export default defineConfig({
  flavortown: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/ft/types.ts",
    },
    input: {
      target: "./specs/flavortown.yaml"
    },
  },
  bugsink: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/bugsink/types.ts",
    },
    input: {
      target: "./specs/bugsink.yaml",
    },
  },
  hcbscan: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/hcbscan/types.ts",
    },
    input: {
      target: "./specs/hcbscan.yaml",
    },
  },
  hcb: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/hcb/types.ts",
    },
    input: {
      target: "./specs/hcb.json",
    },
  },
  sdjam: {
    output: {
      client: "zod",
      mode: "single",
      target: "./src/lib/sdjam/types.ts",
    },
    input: {
      target: "./specs/sdjam.yaml",
    },
  },
});
