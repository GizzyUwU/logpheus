import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "../index";
import { count } from "drizzle-orm";
import { users } from "../schema/users";

export default {
  name: "stats",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { pg, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    try {
      const result = await pg.select({ count: count() }).from(users);
      const recordCount = result[0]?.count || 0;

      await respond({
        text: `There ${recordCount === 1 ? "is" : "are"} ${recordCount} record${recordCount === 1 ? "" : "s"} in the database indicating the amount of users.`,
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
        if (sentryEnabled) {
          Sentry.captureException(error, {
            extra: {
              type: "view",
              command: "stats",
            },
          });
        } else {
          console.error(error);
        }
        await respond({
          text: "An unexpected error occurred. Check logs.",
          response_type: "ephemeral",
        });
      }
    }
  },
};
