import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, count } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "user",
  execute: async (
    { command, body, respond, payload }: SlackCommandMiddlewareArgs,
    {
      pg,
      client,
      clients,
      logger,
      callbackId,
      sentryEnabled,
      Sentry,
      prefix,
    }: RequestHandler,
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
      const userExists = (await pg
        .select({ count: count() })
        .from(users)
        .where(eq(users.userId, command.user_id))
        .limit(1)) as { count: number }[];

      if (userExists[0]?.count === 0)
        return respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
          response_type: "ephemeral",
        });

      console.log("BEEPS AT YOU FUCKING VIOLENTLY BECAUSE YOUR SO FUCKING ANNOYING I SWEAR TO FUCKING GOD JUST FUCKING WORK YOU DUMB BITCH", callbackId)

      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId,
          title: {
            type: "plain_text",
            text: /^[a-z]/i.test(prefix!)
              ? prefix![0]!.toUpperCase() + prefix!.slice(1)
              : prefix!,
          },
          private_metadata: JSON.stringify({
            channel: command.channel_id,
          }),
          blocks: [
            {
              type: "input",
              block_id: "target_user",
              element: {
                type: "users_select",
                action_id: "user",
                placeholder: {
                  type: "plain_text",
                  text: "Pick a user",
                },
              },
              label: {
                type: "plain_text",
                text: "User",
              },
            },
          ],
          submit: {
            type: "plain_text",
            text: "Submit",
          },
        },
      });
      //   const projectId = command.text.trim();
      //   const res = await pg
      //     .select()
      //     .from(users)
      //     .where(eq(users.channel, command.channel_id));
      //   if (res.length === 0)
      //     return await respond({
      //       text: `No API key found for this channel.`,
      //       response_type: "ephemeral",
      //     });
      //   const data = res[0];

      //   if (projectId.length > 0) {
      //     if (!Number.isInteger(Number(projectId)))
      //       return await respond({
      //         text: "Project ID must be a valid number.",
      //         response_type: "ephemeral",
      //       });

      //     if (!data?.projects.includes(Number(projectId)))
      //       return await respond({
      //         text: "This project id isn't subscribed to this channel.",
      //         response_type: "ephemeral",
      //       });

      //     const updatedProjects = data.projects.filter(
      //       (p) => p !== Number(projectId),
      //     );
      //     if (updatedProjects.length > 0) {
      //       await pg
      //         .update(users)
      //         .set({
      //           projects: updatedProjects,
      //         })
      //         .where(eq(users.channel, command.channel_id));
      //     } else {
      //       await pg.delete(users).where(eq(users.channel, command.channel_id));
      //     }

      //     if (clients[data.apiKey]) delete clients[data.apiKey];
      //     return await respond({
      //       text: `Project ${projectId} has been disconnected from this channel.`,
      //       response_type: "ephemeral",
      //     });
      //   } else {
      //     for (const pid of data?.projects!) {
      //       await pg
      //         .delete(projectData)
      //         .where(eq(projectData.projectId, Number(pid)));
      //     }

      //     await pg.delete(users).where(eq(users.channel, command.channel_id));
      //     if (clients[data!.apiKey]) delete clients[data!.apiKey];
      //     return await respond({
      //       text: "All projects previously connected to this channel have been disconnected.",
      //       response_type: "ephemeral",
      //     });
      //   }
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
