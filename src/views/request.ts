import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";
type UserInsert = typeof users.$inferInsert;

export default {
  name: "request",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client }: RequestHandler,
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const channelId = JSON.parse(view.private_metadata).channel;
      const userId = body.user.id;

      if (!channelId || !userId) {
        const ctx = logger.with({
          view,
        });
        if (!channelId) {
          ctx.error("There is no channel id for this channel?");
        } else {
          ctx.error("There is no user id for this user?");
        }

        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "An unexpected error occurred!",
        });
      }

      const values = view.state.values;
      const requestTitle = values["requestTitle"]?.["title"]?.value?.trim();
      const requestBody = values["requestBody"]?.["body"]?.value?.trim();

      const newTask = await client.tasks.createTask(projectId, {
        title: 'My new task',
        description: 'Task description',
        due_date: '2025-12-31T23:59:59Z',
      });
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text: ":woah-dino: You sucessfully registered! :yay:",
      });
    } catch (err) {
      const ctx = logger.with({
        data: {
          channel: JSON.parse(view.private_metadata).channel ?? "",
          user: body.user.id ?? "",
        },
      });
      ctx.error("Unexpected error occurred", {
        error: err,
      });
      await client.chat.postEphemeral({
        channel: JSON.parse(view.private_metadata).channel ?? "",
        user: body.user.id ?? "",
        text: "An unexpected error occurred!",
      });
    }
  },
};
