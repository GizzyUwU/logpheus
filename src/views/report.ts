import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import { vikClient } from "..";
import type { VikunjaClient } from "node-vikunja";

export default {
  name: "report",
  requireVikunja: true,
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { logger, client }: RequestHandler,
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

      const newFeatReq = await (vikClient as VikunjaClient).tasks.createTask(Number(process.env["VIKUNJA_BUG_PROJECT_ID"]), {
        title: String(requestTitle) + " - " + userId,
        description: String(requestBody),
        project_id: Number(process.env["VIKUNJA_BUG_PROJECT_ID"])
      });

      await (vikClient as VikunjaClient).tasks.addLabelToTask(Number(newFeatReq.id), {
        task_id: Number(newFeatReq.id),
        label_id: Number(process.env["VIKUNJA_BUG_LABEL_ID"])
      });
      
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "This has been assigned the identifer" + " " + newFeatReq.identifier,
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
