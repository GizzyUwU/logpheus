import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import Macondo from "@/lib/macondo";
import { getGenericErrorMessage } from "@/lib/genericError";
type UserRow = typeof yswsUsers._.inferSelect;

export default {
  name: "config",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    {
      pg,
      logger,
      client,
      clients,
      prefix,
      folder,
      userData,
      yswsData,
      yswsId,
    }: RequestHandler & { yswsId: number },
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

      const flatValues = Object.entries(view.state.values).reduce(
        (acc, [, block]) => {
          for (const [actionId, val] of Object.entries(block)) {
            acc[actionId] = val.value?.trim();
          }
          return acc;
        },
        {} as Record<string, string | undefined>,
      );

      const updateFields: Partial<UserRow> = {};
      if (flatValues["acc_id"]) {
        const accId = flatValues["acc_id"]!;
        if (yswsData && Object.keys(yswsData).length === 0)
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          });

        updateFields.accId = accId;
        if (yswsData?.disabled) updateFields.disabled = false;
        if (!clients[`${yswsData?.yswsId}:${yswsData?.userId}`]) {
          const AdapterClass = await loadAdapter(ysws.macondo.adapter);
          clients[`${yswsData?.yswsId}:${yswsData?.userId}`] = new AdapterClass({
            logtape: logger,
          });
        }
      }

      if (flatValues["region"]) {
        updateFields.region = flatValues["region"];
      }

      if (view.state.values?.["jobs"]?.["jobs"]?.selected_options) {
        for (const job of view.state.values?.["jobs"]?.["jobs"]
          ?.selected_options) {
          if (
            ysws.macondo.jobConfig[job.value] &&
            ysws.macondo.jobConfig[job.value]?.apiKeyRequired &&
            (!yswsData?.apiKey || yswsData?.apiKey.length === 0) &&
            (!flatValues["api_key"] || flatValues["api_key"].length === 0)
          ) {
            return await client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: `${job.value} requires an API key to be set! Rerun \`/${prefix}-mc config\` command to set an api key and add the job`,
            });
          }

          if (
            ysws.macondo.jobConfig[job.value] &&
            ysws.macondo.jobConfig[job.value]?.channelRequired &&
            (!userData?.channel || userData?.channel.length === 0)
          ) {
            return await client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: `${job.value} requires a channel id to be set! Run the \`/${prefix} config\` command to set a channel id and then rerun this command to add the job.`,
            });
          }
        }
        
        updateFields.registeredJobs = view.state.values["jobs"][
          "jobs"
        ].selected_options.map((option) => option.value);
      }

      if (flatValues["api_key"]) {
        const mc = new Macondo(logger, flatValues["api_key"]!);
        const res = await mc.me()
        if(res.status === 200) {
          updateFields.apiKey = flatValues["api_key"];
        } else {
          return  await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Issue with api key: " + getGenericErrorMessage(res.status, prefix!) || "Unable to process api key try later!",
          });
        }
      }

      if (Object.keys(updateFields).length > 0) {
        await pg
          .update(yswsUsers)
          .set(updateFields)
          .where(
            and(eq(yswsUsers.userId, userId), eq(yswsUsers.yswsId, yswsId)),
          );

        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Updated successfully! :yippeee:",
        });
      } else {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Nothing to do as nothing changed. :sad-pf:",
        });
      }
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
