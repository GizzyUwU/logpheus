import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, inArray } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import { projects } from "../schema/projects";

export default {
  name: "remove",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client, clients, sentryEnabled, Sentry }: RequestHandler,
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
      const projectId = command.text.trim();
      const res = await pg
        .select()
        .from(users)
        .where(eq(users.userId, command.user_id));
      if (res.length === 0)
        return await respond({
          text: `No API key found for this channel.`,
          response_type: "ephemeral",
        });
      const data = res[0];

      if (projectId === "all") {
        const projectIds = res[0]?.projects;

        if (Array.isArray(projectIds) && projectIds.length > 0) {
          await pg.delete(projects).where(inArray(projects.id, projectIds));
        }

        await pg.delete(users).where(eq(users.userId, command.user_id));

        return await respond({
          text: `Deleted you and all your projects from db`,
          response_type: "ephemeral",
        });
      }

      if (projectId.length > 0) {
        if (!Number.isInteger(Number(projectId)))
          return await respond({
            text: "Project ID must be a valid number.",
            response_type: "ephemeral",
          });

        if (!data?.projects?.includes(Number(projectId)))
          return await respond({
            text: "This project id isn't subscribed to this channel.",
            response_type: "ephemeral",
          });

        const updatedProjects = data.projects.filter(
          (p) => p !== Number(projectId),
        );
        if (updatedProjects.length > 0) {
          await pg
            .update(users)
            .set({
              projects: updatedProjects,
            })
            .where(eq(users.channel, command.channel_id));
        } else {
          await pg.delete(users).where(eq(users.channel, command.channel_id));
        }

        if (clients[data.apiKey]) delete clients[data.apiKey];
        return await respond({
          text: `Project ${projectId} has been disconnected from this channel.`,
          response_type: "ephemeral",
        });
      } else {
        for (const pid of data?.projects!) {
          await pg.delete(projects).where(eq(projects.id, Number(pid)));
        }

        await pg.delete(users).where(eq(users.channel, command.channel_id));
        if (clients[data!.apiKey]) delete clients[data!.apiKey];
        return await respond({
          text: "All projects previously connected to this channel have been disconnected.",
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
        if (sentryEnabled) {
          logger.error({ error });
        } else {
          console.error(error);
        }

        await respond({
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
