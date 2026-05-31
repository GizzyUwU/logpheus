import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index";
import { and, eq } from "drizzle-orm";
import { projects } from "@/schema/projects";
import { getGenericErrorMessage } from "@/lib/genericError";
import { yswsUsers } from "@/schema/ysws";
import { users } from "@/schema/users";
import ysws from "@/ysws";
import type Macondo from "@/lib/macondo";
type YSWSRow = typeof yswsUsers._.inferSelect;

export default {
  name: "add",
  params: "[projectId || null]",
  desc: "Subscribe a project to get automated devlogs posts to your channel!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    {
      logger,
      client,
      pg,
      prefix,
      userData,
      folder,
      yswsData,
      yswsClient,
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
      if (command.user_id !== channel.channel?.creator)
        return await respond({
          text: "You can only run this command in a channel that you are the creator of",
          response_type: "ephemeral",
        });

      if (userData && Object.keys(userData).length === 0)
        return respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix} register`,
          response_type: "ephemeral",
        });

      if (yswsData && Object.keys(yswsData).length === 0)
        return respond({
          text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          response_type: "ephemeral",
        });

      const updateYSWSFields: Partial<YSWSRow> = {};
      const projectId = Number(
        command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim(),
      );

      if (!yswsClient) return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

      const mcClient: Macondo = yswsClient.raw as Macondo;
      
      if (!projectId) {
        const allProjects = await mcClient.userProjects({
          userId: yswsData?.accId!,
        });

        if (!allProjects || !allProjects.status) {
          return respond({
            text: "Unexpected error has occurred.",
            response_type: "ephemeral",
          });
        }

        if (
          !allProjects.ok ||
          !Object.keys(allProjects.data)?.length ||
          !allProjects.data ||
          allProjects.data.length === 0
        ) {
          switch (allProjects.status) {
            default:
              const msg = getGenericErrorMessage(allProjects.status, prefix!);
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral",
              });
          }
        }

        const projectsArr = Array.isArray(yswsData?.projects)
          ? Array.from(
              new Set(
                yswsData?.projects.filter(
                  (p): p is number => Number.isInteger(p) && p > 0,
                ),
              ),
            )
          : [];

        const newProjects = allProjects.data.filter(
          (p) => !projectsArr.includes(Number(p.id)),
        );

        if (newProjects.length === 0) {
          return respond({
            text: "YOU SILLY GOOSE! All these projects are already subscribed.",
            response_type: "ephemeral",
          });
        }

        updateYSWSFields.projects = [
          ...projectsArr,
          ...newProjects.map((p) => p.id),
        ];

        await pg
          .update(yswsUsers)
          .set(updateYSWSFields)
          .where(and(eq(yswsUsers.userId, command.user_id), eq(yswsUsers.yswsId, ysws.macondo.id)));

        if (!userData?.channel) {
          await pg
            .update(users)
            .set({
              channel: command.channel_id
            })
            .where(eq(users.userId, command.user_id));
        }
        
        for (const project of newProjects) {
          const freshProject = await mcClient.project({ id: project.id });
          if (!freshProject || !freshProject.status) {
            return client.chat.postEphemeral({
              channel: command.channel_id,
              user: command.user_id,
              text: "Unexpected error has occurred.",
            });
          }
          
          if (!freshProject.ok || !Object.keys(freshProject.data)?.length) {
            switch (freshProject.status) {
              case 404:
                return client.chat.postEphemeral({
                  channel: command.channel_id,
                  user: command.user_id,
                  text: "Project doesn't exist.",
                });
              default:
                const msg = getGenericErrorMessage(freshProject.status, prefix!);
                return client.chat.postEphemeral({
                  channel: command.channel_id,
                  user: command.user_id,
                  text: msg ?? "Unexpected error has occured!",
                });
            }
          }

          const devlogIds = Array.isArray(freshProject.data.journals)
            ? freshProject.data.journals
                .map((journal) => journal.id)
                .sort((a, b) => b - a)
            : [];

          await pg
            .insert(projects)
            .values({
              id: project.id,
              devlogIds,
            })
            .onConflictDoUpdate({
              target: projects.id,
              set: {
                devlogIds,
              },
            });
        }

        const shownProjects = newProjects.slice(0, 5);
        const remainingCount = newProjects.length - shownProjects.length;

        return respond({
          unfurl_links: false,
          unfurl_media: false,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `:woah-dino: Subscribed to *${newProjects.length}* new project(s)! :yay:`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: shownProjects
                  .map(
                    (p) =>
                      `• <https://macondo.hackclub.com/projects/${p.id}|${p.name}>`,
                  )
                  .join("\n"),
              },
            },
            ...(remainingCount > 0
              ? ([
                  {
                    type: "context",
                    elements: [
                      {
                        type: "mrkdwn",
                        text: `…and *${remainingCount} more* project(s).`,
                      },
                    ],
                  },
                ] as {
                  type: string;
                  elements: {
                    type: string;
                    text: string;
                  }[];
                }[])
              : []),
          ],
          response_type: "in_channel",
        });
      } else {
        if (!Number.isInteger(projectId))
          return respond({
            text: `Project ID has to be a integer`,
            response_type: "ephemeral",
          });

        const projectsArr = Array.isArray(yswsData?.projects)
          ? Array.from(
              new Set(
                yswsData?.projects.filter(
                  (p): p is number => Number.isInteger(p) && p > 0,
                ),
              ),
            )
          : [];

        if (projectsArr.includes(projectId)) {
          return respond({
            text: "Project already registered",
            response_type: "ephemeral",
          });
        }

        projectsArr.push(projectId);

        updateYSWSFields.projects = projectsArr;
        await pg
          .update(yswsUsers)
          .set(updateYSWSFields)
          .where(and(eq(yswsUsers.userId, command.user_id), eq(yswsUsers.yswsId, ysws.macondo.id)));
        
        if (!userData?.channel) {
          await pg
            .update(users)
            .set({
              channel: command.channel_id
            })
            .where(eq(users.userId, command.user_id));
        }

        const freshProject = await mcClient.project({ id: projectId });
        if (!freshProject || !freshProject.status) {
          return client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            text: "Unexpected error has occurred.",
          });
        }
        
        if (!freshProject.ok || !Object.keys(freshProject.data)?.length) {
          switch (freshProject.status) {
            case 404:
              return client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: "Project doesn't exist.",
              });
            default:
              const msg = getGenericErrorMessage(freshProject.status, prefix!);
              return client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: msg ?? "Unexpected error has occured!",
              });
          }
        }

        const devlogIds = Array.isArray(freshProject.data.journals)
          ? freshProject.data.journals
              .map((journal) => journal.id)
              .sort((a, b) => b - a)
          : [];

        await pg
          .insert(projects)
          .values({
            id: projectId,
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
                text: `:woah-dino: <https://flavortown.hackclub.com/projects/${projectId}|${freshProject.data.name}'s> devlogs just got subscribed to the channel. :yay:`,
              },
            },
            ...(freshProject.data.description
              ? ([
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
                ] as {
                  type: "section";
                  text: {
                    type: "mrkdwn";
                    text: string;
                  };
                }[])
              : []),
          ],
          response_type: "in_channel",
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
