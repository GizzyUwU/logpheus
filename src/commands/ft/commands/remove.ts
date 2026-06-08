import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { projects } from "@/schema/projects";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";

export default {
  name: "remove",
  params: "[projectId]",
  desc: "Unsubscribe a project or all projects from the automated devlog poster",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client, clients, prefix, yswsData, folder }: RequestHandler,
  ) => {
    try {
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });

      if (!channel)
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (command.user_id !== channel.channel?.creator)
        return await respond({
          text: "You can only run this command in a channel that you are the creator of",
          response_type: "ephemeral",
        });

      if (yswsData && Object.keys(yswsData).length === 0)
        return respond({
          text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          response_type: "ephemeral",
        });

      const projectId = Number(command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim() ?? "0");
      const subscribedProjects = Array.isArray(yswsData?.projects)
        ? yswsData.projects
        : [];

      if (!projectId) {
        for (const pid of subscribedProjects) {
          await pg.delete(projects).where(and(eq(projects.id, pid), eq(projects.ysws, ysws.flavortown.id)));
        }

        await pg
          .update(yswsUsers)
          .set({
            projects: [],
          })
          .where(and(eq(yswsUsers.userId, command.user_id), eq(yswsUsers.yswsId, ysws.flavortown.id)));

        if (yswsData?.apiKey && clients[yswsData.apiKey]) delete clients[yswsData.apiKey];
        return await respond({
          text: "All projects previously connected to this channel have been disconnected.",
          response_type: "ephemeral",
        });
      } else {
        if (!Number.isInteger(projectId) || projectId <= 0)
          return respond({
            text: `Project ID has to be a integer`,
            response_type: "ephemeral",
          });

          if (!subscribedProjects.includes(projectId))
            return await respond({
              text: "This project id isn't subscribed to this channel.",
              response_type: "ephemeral",
            });

          await pg.delete(projects).where(and(eq(projects.id, projectId), eq(projects.ysws, ysws.flavortown.id)));

          const updatedProjects = subscribedProjects.filter(
            (p) => p !== projectId,
          );

          await pg
            .update(yswsUsers)
            .set({
              projects: updatedProjects,
            })
            .where(and(eq(yswsUsers.userId, command.user_id), eq(yswsUsers.yswsId, ysws.flavortown.id)));

          return await respond({
            text: `Project ${projectId} has been disconnected from this channel.`,
            response_type: "ephemeral",
          });
      }
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
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
