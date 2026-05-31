import { z } from "zod";
export const jobOptions = z.enum(["newDevlog"]);
const regionsSchema = z.record(z.string(), z.string());

export const yswsItem = z.object({
  id: z.number(),
  humanName: z.string(),
  currencyName: z.string(),
  adapter: z.string(),
  apiKeyRequired: z.boolean(),
  mediaUrl: z.string(),
  url: z.string(),
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
    mediaUrl: "https://flavortown.hackclub.com",
    url: "https://flavortown.hackclub.com",
    apiKeyRequired: true,
    maxMult: 30,
    jobs: [] as z.infer<typeof jobOptions>[],
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
    adapter: "macondo/adapter.ts",
    mediaUrl: "https://cdn.hackclub.com",
    url: "https://macondo.hackclub.com",
    apiKeyRequired: false,
    maxMult: 2,
    jobs: ["newDevlog"] as z.infer<typeof jobOptions>[],
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
