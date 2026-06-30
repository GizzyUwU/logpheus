import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import yswsData from "@/ysws";

export default {
  name: "ysws",
  desc: "See Logpheus's supported YSWSs!",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { logger }: RequestHandler,
  ) => {
    try {
      const text = Object.values(yswsData)
        .flatMap((ysws) => [
          {
            label: `${ysws.humanName} (${ysws.short})`,
            value: ""
          },
          {
            label: "Identifer",
            value: ysws.id
          },
          {
            label: "URL",
            value: ysws.url,
          },
          {
            label: "Currency",
            value: ysws.currencyName
          },
          {
            label: "API Key Required?",
            value: ysws.apiKeyRequired ? "Yes" : "No"
          }
        ])
        .map((f) =>
          f.label && (!f.value || String(f.value).length === 0)
            ? `*${f.label}*`
            : `*${f.label}*: ${f.value}`,
        )
        .join("\n");
      await respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text,
            },
          },
        ],
        response_type: "ephemeral",
      });
    } catch (error: any) {
      if (
        error.code === "slack_webapi_platform_error" &&
        error.data?.error === "channel_not_found"
      ) {
        await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
        return;
      } else {
        logger.error({ error });
        await respond({
          text: "An unexpected error occurred. Check logs.",
          response_type: "ephemeral",
        });
      }
    }
  },
};
