import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import { projects } from "../schema/projects";
import checkAPIKey from "../lib/apiKeyCheck";
import FT from "../lib/ft";
import { getGenericErrorMessage } from "../lib/genericError";
type UserRow = typeof users._.inferSelect;

export default {
  name: "add",
  params: "[projectId]",
  desc: "Subscribe a project to get automated devlogs posts to your channel!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { callbackId, logger, client, pg, prefix }: RequestHandler,
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

      const updateFields: Partial<UserRow> = {};


      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, command.user_id));

      if (userData.length === 0)
        return await respond({
          text: `Run /${prefix}-register first to be able to run this command.`,
          response_type: "ephemeral",
        });

      const projectId = command.text.trim()
      if (!projectId) {

        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: "modal",
            callback_id: callbackId!,
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
                block_id: "projId",
                label: {
                  type: "plain_text",
                  text: "What is the project's id",
                },
                element: {
                  type: "plain_text_input",
                  action_id: "proj_input",
                  multiline: false,
                },
              },
            ],
            submit: {
              type: "plain_text",
              text: "Submit",
            },
          },
        });
      } else {
        if (!Number.isInteger(Number(projectId))) return respond({
          text: `Project ID has to be a integer`,
          response_type: "ephemeral",
        })
        const checkKey = String(userData[0]?.apiKey);

        const working = await checkAPIKey({
          db: pg,
          apiKey: checkKey,
          logger,
        });
        if (!working.works)
          return respond({
            text: "Flavortown API Key is invalid, provide a valid one.",
            response_type: "ephemeral",
          });

        const apiKey = checkKey!;

        const ftClient = new FT(apiKey, logger);
        const projectsArr = Array.isArray(userData[0]?.projects)
          ? Array.from(
            new Set(
              userData[0]?.projects.filter(
                (p): p is number => Number.isInteger(p) && p > 0,
              ),
            ),
          )
          : [];

        if (projectsArr.includes(Number(projectId))) {
          return respond({
            text: "Project already registered",
            response_type: "ephemeral",

          });
        }

        projectsArr.push(Number(projectId));
        if (!userData[0]?.userId) {
          updateFields.userId = command.user_id;
        }

        if (!userData[0]?.channel) {
          updateFields.channel = command.channel_id;
        }

        updateFields.projects = projectsArr;
        await pg.update(users).set(updateFields).where(eq(users.userId, command.user_id));

        const freshProject = await ftClient.project({ id: Number(projectId) });
        if (!freshProject || !freshProject.status) {
          return respond({
            text: "Unexpected error has occurred.",
            response_type: "ephemeral"
          });
        }

        if (!freshProject.ok || !Object.keys(freshProject.data)?.length) {
          switch (freshProject.status) {
            case 404:
              return respond({
                text: "Project doesn't exist.",
                response_type: "ephemeral"
                ,
              });
            default:
              const msg = getGenericErrorMessage(freshProject.status, prefix!);
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral"
              });
          }
        }

        const devlogIds = Array.isArray(freshProject.data.devlog_ids)
          ? freshProject.data.devlog_ids
          : [];

        await pg
          .insert(projects)
          .values({
            id: Number(projectId),
            devlogIds,
          })
          .onConflictDoUpdate({
            target: projects.id,
            set: {
              devlogIds,
            },
          });

        return respond({
            unfurl_links: false,
            unfurl_media: false,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `:woah-dino: <https://flavortown.hackclub.com/projects/${Number(projectId)}|${freshProject.data.title}'s> devlogs just got subscribed to the channel. :yay:`,
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: String(freshProject.data.description)
                    .split("\n")
                    .map((line: string) => `> ${line}`)
                    .join("\n"),
                },
              },
            ],
            response_type: "in_channel"
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
