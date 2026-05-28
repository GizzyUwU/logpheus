import { z } from "zod";
export default {
  flavortown: {
    id: 1,
    humanName: "Flavortown",
    apiKeyRequired: true
  },
  macondo: {
    id: 2,
    humanName: "Macondo",
    apiKeyRequired: false
  }
}

export const yswsItem = z.object({
  id: z.number(),
  humanName: z.string(),
  apiKeyRequired: z.boolean(),
})

export const yswsSchema = z.record(z.string(), yswsItem);

export const YSWSId = z.object({
  yswsId: z.coerce.number().int().nonnegative()
});