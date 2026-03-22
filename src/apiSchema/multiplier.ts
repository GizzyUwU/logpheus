import * as zod from "zod";

export const MultiplierPostGet = zod.object({
  multiplier: zod.number(),
});

export const MultiplierError = zod.object({
  msg: zod.string()
});