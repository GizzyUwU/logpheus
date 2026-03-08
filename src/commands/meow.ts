import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
// import type { RequestHandler } from "..";

export default {
  name: "meow",
  execute: async (
    { command }: SlackCommandMiddlewareArgs,
  ) => {
    const projectIdRaw = command.text.trim();
    console.log(projectIdRaw)
  }
}