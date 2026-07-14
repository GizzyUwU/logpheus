import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import type Macondo from "@/lib/macondo";

const formatDate = (iso: string) => {
  const d = new Date(iso);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear(),
  ).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
};

export default {
  name: "user",
  params: "[userMention]",
  desc: "View a user's flavortown profile.",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    {
      pg,
      client,
      yswsClient,
      logger,
      prefix,
      folder,
      yswsData,
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

      if (yswsData && Object.keys(yswsData).length === 0)
        return respond({
          text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          response_type: "ephemeral",
        });

      const mention = command.text.trim();
      if (!mention)
        return respond({
          text: `You need to mention a user to view their profile.`,
          response_type: "ephemeral",
        });
      const match = mention.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
      if (!match)
        return respond({
          text: `This wasn't a valid user mention try actually mentioning a user for the argument in this command.`,
          response_type: "ephemeral",
        });

      const mentionId = match[1];
      if(!mentionId) return respond({
        text: `An issue has occurred please try again later.`,
        response_type: "ephemeral",
      });
      const user = await client.users.info({
        user: mentionId
      })
      
      if (!yswsClient) return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

      let mcClient: Macondo = yswsClient.raw as Macondo;

      const queryWithTarget = await mcClient.users({
        search: user.user?.profile?.display_name ?? "",
      });

      if (!queryWithTarget || !queryWithTarget.status) {
        return respond({
          text: "Unexpected error has occurred.",
        });
      }

      if (!queryWithTarget.ok || !queryWithTarget.data.items.length) {
        switch (queryWithTarget.status) {
          case 404:
            return respond({
              text: "User doesn't have an FT account.",
              response_type: "ephemeral",
            });
          default:
            const msg = getGenericErrorMessage(queryWithTarget.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const targetUser = await mcClient.user({
        userId: String(queryWithTarget.data.items[0]?.id),
      });

      if (!targetUser || !targetUser.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!targetUser.ok || !Object.keys(targetUser.data)?.length) {
        switch (targetUser.status) {
          case 404:
            return respond({
              text: "User doesn't have an FT account.",
              response_type: "ephemeral",
            });
          default:
            const msg = getGenericErrorMessage(targetUser.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const userText = [
        { label: "Account ID", value: targetUser.data.id },
        { label: "Top Streak Days", value: targetUser.data.top_streak_days },
        { label: "Total Upvotes", value: targetUser.data.total_upvotes },
        { label: "Project Count", value: targetUser.data.project_count },
        {
          label: "Created At",
          value: formatDate(targetUser.data.created_at)
        },
        {
          label: "Last Active Date",
          value: formatDate(targetUser.data.last_active_date)
        },
        {
          label: "Projects",
          value:
            targetUser.data.projects &&
            targetUser.data.projects.length > 0
              ? targetUser.data.projects
                  .map(
                    (project) =>
                      `<https://macondo.hackclub.com/projects/${project.id}|${project.name}>`,
                  )
                  .join(", ")
              : "No projects",
        }
      ]
        .map((f) => `*${f.label}*: ${f.value}`)
        .join("\n");
      return await respond({
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: targetUser.data.username ?? "Unknown",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: userText,
            },
            accessory: {
              type: "image",
              image_url:
                user.user?.profile?.image_72 ?? "https://avatars.slack-edge.com/2026-02-16/10546676907328_5d442ad696e294c5feb7_512.png",
              alt_text:
                (targetUser.data.username ?? "Unknown") + "'s avatar",
            },
          },
          {
            type: "divider",
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text:
                  "https://macondo.hackclub.com/users/" + targetUser.data.id,
              },
            ],
          },
        ],
        response_type: "ephemeral",
      });
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
