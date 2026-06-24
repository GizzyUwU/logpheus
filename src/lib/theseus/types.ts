import * as z from "zod";

export namespace ZTypes {
  /**
   * @summary Get's api key owner's data from API
   */
  export const GetMeResponse = z.object({
    user: z.object({
      id: z.string()
    })
  })

  /**
   * @summary Fetch's list of mail of all types from API
   */
  export const ListMailResponse = z.object({
    mail: z.array(z.object({
      id: z.string(),
      type: z.string(),
      path: z.string(),
      public_url: z.string(),
      status: z.string(),
      tags: z.array(z.string()),
      title: z.string().nullish(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      dispatched_at: z.iso.datetime().nullish(),
      mailed_at: z.iso.datetime().nullish(),
      carrier: z.string().nullish(),
      service: z.string().nullish(),
      weight: z.string().nullish(),
      contents: z.array(z.object({
        hc_sku: z.string(),
        name: z.string(),
        quantity: z.number()
      })).nullish()
    }))
  })

  /**
   * @summary Fetches mail only of the letter type from API
   */
  export const ListLettersResponse = z.object({
    letters: z.array(z.object({
      id: z.string(),
      type: z.string(),
      path: z.string(),
      public_url: z.string(),
      tags: z.array(z.string()),
      title: z.string().nullish(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime()
    }))
  })

  /**
   * @summary Parameters used to fetch a singular letter from API
   */
  export const GetLetterParams = z.object({
    id: z.string()
  })

  /**
   * @summary Fetches a singular letter from the API
   */
  export const GetLetterResponse = z.object({
    letter: z.object({
      id: z.string(),
      type: z.string(),
      path: z.string(),
      public_url: z.string(),
      tags: z.array(z.string()),
      title: z.string().nullish(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      events: z.array(z.object({
        happened_at: z.iso.datetime(),
        source: z.string(),
        facility: z.string(),
        description: z.string(),
        location: z.string(),
      })).nullish()
    })
  })

  /**
   * @summary Fetches mail only of the package type from API
   */
  export const ListPackagesResponse = z.object({
    packages: z.array(z.object({
      id: z.string(),
      type: z.string(),
      path: z.string(),
      public_url: z.string(),
      tags: z.array(z.string()),
      title: z.string().nullish(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      dispatched_at: z.iso.datetime().nullish(),
      mailed_at: z.iso.datetime().nullish(),
      tracking_number: z.string().nullish(),
      tracking_link: z.string().nullish(),
      carrier: z.string().nullish(),
      weight: z.string().nullish(),
      contents: z.array(z.object({
        hc_sku: z.string(),
        name: z.string(),
        quantity: z.number()
      })).nullish()
    }))
  })
}