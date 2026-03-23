import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { vikClient } from "..";
import type { VikunjaClient } from "node-vikunja";
import { htmlToMarkdown, parseMarkdownToSlackBlocks } from "../lib/parseMarkdown";

export default {
  name: "view",
  requireVikunja: true,
  params: "feature/bug [optional id]",
  desc: "Let's take a peek into the open feature requests/bug reports or maybe look at a specific one :3",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client }: RequestHandler,
  ) => {
    try {
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });
      if (
        !channel ||
        !channel.channel ||
        Object.keys(channel).length === 0 ||
        !channel.ok
      )
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (!channel?.channel.id) {
        logger.error("There is no channel id for this channel?");
        return;
      }

      const [action, id] = command.text.trim().split(" ").filter(Boolean);
      if (!action)
        return await respond({
          text: "An action is required please type either feature or bug",
          response_type: "ephemeral",
        });

      let identifier = id;
      if (!String(identifier).startsWith("#")) {
        identifier = "#" + id;
      }

      switch (action) {
        case "feature": {
          const tasksList = await (
            vikClient as VikunjaClient
          ).tasks.getProjectTasks(
            Number(process.env["VIKUNJA_FEATURE_PROJECT_ID"]),
          );
          if (!id) {
            return respond({
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text:
                      "*Feature Requests*:\n" +
                      (tasksList.length
                        ? tasksList
                            .map(
                              (item) =>
                                `• ${String(item.identifier).slice(1)} - ${item.title} - ${item.done}`,
                            )
                            .join("\n")
                        : "There is no feature reqeusts."),
                  },
                },
                {
                  type: "context",
                  elements: [
                    {
                      type: "plain_text",
                      text: "Format as 'ID - Title - Completed'",
                    },
                  ],
                },
              ],
              response_type: "ephemeral",
            });
          } else {
            const task = tasksList.filter(
              (item) => item.identifier === identifier,
            );
            if (!task || task.length === 0)
              return await respond({
                text: "This identifier appers to not exist",
                response_type: "ephemeral",
              });

            const descriptionHtml = task[0]?.description ?? "";
            const markdown = htmlToMarkdown(descriptionHtml);
            const blocks = parseMarkdownToSlackBlocks(markdown);
            const userText = [
              { label: "Labels", value: (task[0]?.labels ?? []).map(l => l.title).join(", ")  },
              {
                label: "Completed",
                value: task[0]?.done,
              },
              {
                label: "Created at",
                value: task[0]?.created,
              },
              {
                label: "Updated at",
                value: task[0]?.updated,
              },
              ...(task[0]?.done
                ? [
                    {
                      label: "Completed at",
                      value: task[0]?.done_at,
                    },
                  ]
                : []),
            ]
              .map((f) => `*${f.label}*: ${f.value}`)
              .join("\n");
            return respond({
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: task[0]?.title ?? "Unknown",
                  },
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: userText,
                  },
                },
                ...blocks
              ],
              response_type: "ephemeral",
            });
          }
        }
          
        case "bug": {
          const tasksList = await (
            vikClient as VikunjaClient
          ).tasks.getProjectTasks(
            Number(process.env["VIKUNJA_BUG_PROJECT_ID"]),
          );
          if (!id) {
            return respond({
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text:
                      "*Bug Reports*:\n" +
                      (tasksList.length
                        ? tasksList
                            .map(
                              (item) =>
                                `• ${String(item.identifier).slice(1)} - ${item.title} - ${item.done}`,
                            )
                            .join("\n")
                        : "There is no bug reports."),
                  },
                },
                {
                  type: "context",
                  elements: [
                    {
                      type: "plain_text",
                      text: "Format as 'ID - Title - Completed'",
                    },
                  ],
                },
              ],
              response_type: "ephemeral",
            });
          } else {
            const task = tasksList.filter(
              (item) => item.identifier === identifier,
            );
            if (!task || task.length === 0)
              return await respond({
                text: "This identifier appers to not exist",
                response_type: "ephemeral",
              });

            const descriptionHtml = task[0]?.description ?? "";
            const markdown = htmlToMarkdown(descriptionHtml);
            const blocks = parseMarkdownToSlackBlocks(markdown);
            const userText = [
              { label: "Labels", value: (task[0]?.labels ?? []).map(l => l.title).join(", ")  },
              {
                label: "Completed",
                value: task[0]?.done,
              },
              {
                label: "Created at",
                value: task[0]?.created,
              },
              {
                label: "Updated at",
                value: task[0]?.updated,
              },
              ...(task[0]?.done
                ? [
                    {
                      label: "Completed at",
                      value: task[0]?.done_at,
                    },
                  ]
                : []),
            ]
              .map((f) => `*${f.label}*: ${f.value}`)
              .join("\n");
            return respond({
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: task[0]?.title ?? "Unknown",
                  },
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: userText,
                  },
                },
                ...blocks
              ],
              response_type: "ephemeral",
            });
          }
        }
          
        default: {
          return await respond({
            text: "Please type either feature or bug",
            response_type: "ephemeral",
          });
        }
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
