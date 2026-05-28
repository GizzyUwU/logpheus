import { z } from "zod";
export default {
  flavortown: {
    id: 1,
    humanName: "Flavortown",
    apiKeyRequired: true,
    maxMult: 30
  },
  macondo: {
    id: 2,
    humanName: "Macondo",
    apiKeyRequired: false,
    maxMult: 2
  }
} satisfies z.infer<typeof yswsSchema>;

export const yswsItem = z.object({
  id: z.number(),
  humanName: z.string(),
  apiKeyRequired: z.boolean(),
  maxMult: z.number()
})

export const yswsSchema = z.record(z.string(), yswsItem);

export const YSWSId = z.coerce.number().int().nonnegative()
