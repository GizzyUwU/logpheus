import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { bugClient } from "..";
import { validate as isValidUUID } from 'uuid';

export default {
  name: "error",
  requireBugsink: true,
  params: "[issueId]",
  desc: "View errors in Logpheus's sink of bugs!",
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

      const id = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
      if (id) {
        if (!isValidUUID(id)) {
          console.log(id, isValidUUID(id))
          return await respond({
            text: "ID has to be a valid uuid",
          });
        }

        const issueEvent = await bugClient?.listEvents({
          issue: id,
        });
        
        const eventData = await bugClient?.getEvent({
          id: String(issueEvent?.results[0]?.id)
        });
        
        const userText = [
          {
            label: "Type",
            value: String((eventData?.data as any).level),
          },
          {
            label: "Created at",
            value: new Date(Number((eventData?.data as any).extra.timestamp)).toDateString(),
          },
          {
            label: "Stacktrace",
            value: `\`${String(eventData?.stacktrace_md)}\``,
          },
        ]
          .map((f) => `*${f.label}*: ${f.value}`)
          .join("\n");
        return respond({
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: String((eventData?.data as any).logentry?.message) ?? "Unknown",
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: userText,
              },
            },
          ],
          response_type: "ephemeral",
        });
      } else {
        const issues = await bugClient?.listIssues({
          project: Number(process.env["BUGSINK_PROJECT_ID"]),
        });
        console.log(issues)
        return respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text:
                  "*Reported errors*:\n" +
                  (issues?.results && issues.results.length > 0
                    ? issues?.results
                        .map(
                          (item) =>
                          `• \`${String(item.id)}\` - ${item.calculated_type} - ${item.calculated_value} - ${item.is_resolved ? "Yes" : "No"}`,
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
                  text: "Format as 'ID - Type - Reason - Resolved'",
                },
              ],
            },
          ],
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
