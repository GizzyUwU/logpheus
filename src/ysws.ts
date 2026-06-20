import { z } from "zod";
export const jobOptions = z.enum(["newDevlog", "shopTrack", "tempShopMigration"]);
export const jobConfigSchema = z
  .object({
    shopTrack:
      z.object({ channelId: z.string(), jobApiKey: z.string().nullable() })
  }).partial();

const regionsSchema = z.record(z.string(), z.string());

export const yswsItem = z.object({
  id: z.number(),
  humanName: z.string(),
  short: z.string(),
  currencyName: z.string(),
  adapter: z.string(),
  apiKeyRequired: z.boolean(),
  mediaUrl: z.string(),
  url: z.string(),
  maxMult: z.number(),
  jobs: z.array(jobOptions),
  regions: regionsSchema,
  jobConfig: jobConfigSchema,
});

export const yswsSchema = z.record(z.string(), yswsItem);
export const YSWSId = z.coerce.number().int().nonnegative();

export default {
  flavortown: {
    id: 1,
    humanName: "Flavortown",
    short: "ft",
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
    jobConfig: {} as z.infer<typeof jobConfigSchema>,
  },
  macondo: {
    id: 2,
    humanName: "Macondo",
    short: "mc",
    currencyName: "gold",
    adapter: "macondo/adapter.ts",
    mediaUrl: "https://cdn.hackclub.com",
    url: "https://macondo.hackclub.com",
    apiKeyRequired: false,
    maxMult: 2,
    jobs: ["newDevlog", "shopTrack"] as z.infer<typeof jobOptions>[],
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
    jobConfig: {
      shopTrack: {
        channelId: "C0AMENDBWQ0",
        jobApiKey: null
      }
    } as z.infer<typeof jobConfigSchema>,
  },
  stardance: {
    id: 3,
    humanName: "Stardance",
    short: "sd",
    currencyName: "stardust",
    adapter: "",
    mediaUrl: "https://stardance.hackclub.com",
    url: "https://stardance.hackclub.com",
    apiKeyRequired: false,
    maxMult: 30,
    jobs: [] as z.infer<typeof jobOptions>[],
    regions: {
      US: "United States",
      EU: "Europe",
      UK: "United Kingdom",
      IN: "India",
      CA: "Canada",
      AU: "Australia",
      XX: "Rest of World",
    },
    jobConfig: {} as z.infer<typeof jobConfigSchema>,
  },
} satisfies z.infer<typeof yswsSchema>;
