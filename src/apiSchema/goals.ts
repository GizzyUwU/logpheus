import * as zod from "zod";

export const GoalsPutPostDelete = zod.object({
  goals: zod.array(zod.number()),
});

export const GoalsResponse = zod.object({
  goals: zod.array(zod.number()),
});

export const GoalsError = zod.object({
  msg: zod.string()
});