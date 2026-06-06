import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
export default {
  name: "key",
  desc: "Want your logpheus key for the api? Come get it!",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { pg, prefix, userData }: RequestHandler,
  ) => {
    return respond({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              userData?.apiKey ??
              `Something has went wrong! Try again later and if it still occurs run /${prefix} report`,
          },
        },
      ],
      response_type: "ephemeral",
    });
  },
};
