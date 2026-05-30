import { z } from "zod";
export const jobOptions = z.enum(["newDevlog"]);
const regionsSchema = z.record(z.string(), z.string());

export const yswsItem = z.object({
  id: z.number(),
  humanName: z.string(),
  currencyName: z.string(),
  adapter: z.string(),
  apiKeyRequired: z.boolean(),
  maxMult: z.number(),
  jobs: z.array(jobOptions),
   regions: regionsSchema,
});

export const yswsSchema = z.record(z.string(), yswsItem);
export const YSWSId = z.coerce.number().int().nonnegative();

export default {
  flavortown: {
    id: 1,
    humanName: "Flavortown",
    adapter: "flavortown/adapter.ts",
    currencyName: "cookies",
    apiKeyRequired: true,
    maxMult: 30,
    jobs: ["newDevlog"],
    regions: {
      au: "Australia",
      ca: "Canada",
      eu: "Europe",
      in: "India",
      uk: "United Kingdom",
      us: "United States",
      xx: "Other / Unknown",
    },
  },
  macondo: {
    id: 2,
    humanName: "Macondo",
    currencyName: "gold",
    adapter: "macondo.ts",
    apiKeyRequired: false,
    maxMult: 2,
    jobs: [] as z.infer<typeof jobOptions>[],
    regions: {
      NA: "North America",
      SA: "South America",
      EU: "Europe",
      AS: "Asia",
      IN: "India",
      OC: "Oceania",
      AF: "Africa",
      ME: "Middle East",
    },
  },
} satisfies z.infer<typeof yswsSchema>;
