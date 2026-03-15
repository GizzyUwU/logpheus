import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import { projects } from "../schema/projects";

export default {
  name: "remove",
  params: "[projectId]",
  desc: "Unsubscribe a project or all projects from the automated devlog poster",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client, clients }: RequestHandler,
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
          text: `You don't exist in the database.`,
          response_type: "ephemeral",
        });
      const data = res[0];
      const subscribedProjects = Array.isArray(data?.projects)
        ? data.projects
        : [];

      if (projectId.length > 0) {
        if (!/^\d+$/.test(projectId))
          return await respond({
            text: "Project ID must be a valid number.",
            response_type: "ephemeral",
          });

        const numericProjectId = Number(projectId);

        if (!subscribedProjects.includes(numericProjectId))
          return await respond({
            text: "This project id isn't subscribed to this channel.",
            response_type: "ephemeral",
          });

        await pg.delete(projects).where(eq(projects.id, numericProjectId));

        const updatedProjects = subscribedProjects.filter(
          (p) => p !== numericProjectId,
        );

        await pg
          .update(users)
          .set({
            projects: updatedProjects,
          })
          .where(eq(users.userId, command.user_id));

        if (data?.apiKey && clients[data.apiKey]) delete clients[data.apiKey];
        return await respond({
          text: `Project ${projectId} has been disconnected from this channel.`,
          response_type: "ephemeral",
        });
      } else {
        for (const pid of subscribedProjects) {
          await pg.delete(projects).where(eq(projects.id, pid));
        }

        await pg
          .update(users)
          .set({
            projects: [],
          })
          .where(eq(users.userId, command.user_id));

        if (data?.apiKey && clients[data.apiKey]) delete clients[data.apiKey];
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
        logger.error({ error });

        await respond({
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
