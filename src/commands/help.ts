import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { commands } from "..";

export default {
  name: "help",
  hideFromHelp: true,
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { prefix }: RequestHandler,
  ) => {
    const helpText = commands
      .filter((cmd) => !cmd.hideFromHelp)
      .map((cmd) => `• */${prefix}-${cmd.name}* ${cmd.params} — ${cmd.desc}`)
      .join("\n");

    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: (/^[a-z]/i.test(prefix!)
                ? prefix![0]!.toUpperCase() + prefix!.slice(1)
                : prefix!) + "'s commands!",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: helpText,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Logpheus offically condones the projects <https://flavortown.hackclub.com/projects/135|Flavortown Utils> and <https://flavortown.hackclub.com/projects/140|Spicetown> with both having Logpheus integration for goals!",
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
