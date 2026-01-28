import type {
  SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "data",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, client, clients, sentryEnabled, Sentry, prefix }: RequestHandler,
  ) => {
    const userData = (await pg
      .select()
      .from(users)
      .where(eq(users.userId, command.user_id))
      .limit(1));

    if (userData.length === 0)
      return respond({
        text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
        response_type: "ephemeral",
      });

    const userText = [
      { label: "Channel Id:", value: userData[0]?.channel},
      { label: "Disabled:", value: userData[0]?.disabled},
      {
        label: "Projects",
        value:  (userData[0]?.projects ? userData[0].projects
          .map(
            (id: string | number) =>
              `<https://flavortown.hackclub.com/projects/${id}|${id}>`
          )
          .join(", ") : "No projects"),
      },
      {
        label: "Opt Outs",
        value: (userData[0]?.optOuts ? userData[0]?.optOuts.join(", ") : "No data")
      }
    ].map(f => `*${f.label}*: ${f.value}`).join("\n");
    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: (/^[a-z]/i.test(prefix!)
                ? prefix![0]!.toUpperCase() + prefix!.slice(1)
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
        {
          type: "divider",
        },
      ],
      response_type: "ephemeral",
    });
  }
}