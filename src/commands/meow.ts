import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
// import type { RequestHandler } from "..";

export default {
  name: "meow",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
  ) => {
    const mention = command.text.trim();
    return respond({
        text: mention + " " + "Meow!",
        response_type: "in_channel"
    })
  }
}