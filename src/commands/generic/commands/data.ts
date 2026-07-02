import type {
  SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import * as schemas from "@/schema"
import ysws from "@/ysws";

export default {
  name: "data",
  desc: "Look through what data the bot has on you!",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { prefix, userData, yswsAll }: RequestHandler  & { yswsAll: typeof schemas.yswsUsers.$inferSelect[] }
  ) => {
    const userText = [
      { label: "Channel Id", value: userData?.channel},
      { label: "Disabled", value: userData?.disabled},
      {
        label: "YSWSs",
        value:  (yswsAll && yswsAll.length > 0 ? yswsAll
          .map(
            (yswsData) => {
              const yswsConfig = Object.values(ysws).find((record) => record.id === yswsData.yswsId);
              return `<${yswsConfig?.url}|${yswsConfig?.humanName}>`
            }
          )
          .join(", ") : "No projects"),
      },
      {
        label: "Opt Outs",
        value: (userData?.optOuts ? userData?.optOuts.join(", ") : "No data")
      },
        {
        label: "Metadata",
        value: (userData?.meta && userData?.meta.length > 0 ? userData?.meta.join(", ") : "No metadata")
      }
    ].map(f => `*${f.label}*: ${f.value}`).join("\n");
    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: (/^[a-z]/i.test(prefix!)
                ? prefix![0]?.toUpperCase() + prefix!.slice(1)
                : prefix!) + "'s data on you",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: userText,
          },
        },
      ],
      response_type: "ephemeral",
    });
  }
}