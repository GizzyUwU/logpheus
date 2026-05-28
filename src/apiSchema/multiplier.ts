import * as zod from "zod";

export const MultiplierPostGet = zod.object({
  multiplier: zod.coerce.number<string>().int().nonnegative(),
});

export const MultiplierProjectID = zod.coerce.number().int().nonnegative()

export const MultiplierError = zod.object({
  msg: zod.string()
});