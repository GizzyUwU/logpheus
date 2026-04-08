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
    { logger, client, pg, prefix }: RequestHandler,
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
        // const checkKey = String(userData[0]?.apiKey);

        // const working = await checkAPIKey({
        //   db: pg,
        //   apiKey: checkKey,
        //   logger,
        // });
        // if (!working.works)
        //   return respond({
        //     text: "Flavortown API Key is invalid, provide a valid one.",
        //     response_type: "ephemeral",
        //   });

        // const apiKey = checkKey!;
        // const ftClient = new FT(apiKey, logger);
        // const projectsArr = Array.isArray(userData[0]?.projects)
        //   ? Array.from(
        //     new Set(
        //       userData[0]?.projects.filter(
        //         (p): p is number => Number.isInteger(p) && p > 0,
        //       ),
        //     ),
        //   )
        //   : [];

        // const arrOfProjects: any[] = [];
        // let page: number | null = 1;
        // while (page) {
        //   const res = await ftClient.projects({
        //     page
        //   })
        //   if (!res || !res.ok) break;
        //   const data = res.data;
        //   if (data?.projects) {
        //     for (const project of data.projects) {
        //       if (projectsArr.includes(Number(project.id))) continue;
        //       projectsArr.push(Number(project.id))
        //       arrOfProjects.push(project);
        //     }
        //   }
        //   page = data?.pagination?.next_page ?? null;
        // }

        // if (!userData[0]?.userId) {
        //   updateFields.userId = command.user_id;
        // }

        // if (!userData[0]?.channel) {
        //   updateFields.channel = command.channel_id;
        // }

        // updateFields.projects = projectsArr;
        // await pg.update(users).set(updateFields).where(eq(users.userId, command.user_id));


        // const projectRows = arrOfProjects.map((project) => ({
        //   id: Number(project.id),
        //   devlogIds: Array.isArray(project.devlog_ids)
        //     ? project.devlog_ids
        //     : [],
        // }));

        // const existing = await pg
        //   .select({ id: projects.id })
        //   .from(projects)
        //   .where(inArray(
        //     projects.id,
        //     projectRows.map((p) => p.id)
        //   ));

        // const existingIds = new Set(existing.map((e) => e.id));

        // const toInsert = projectRows.filter((p) => !existingIds.has(p.id));
        // const toUpdate = projectRows.filter((p) => existingIds.has(p.id));

        // if (toInsert.length) {
        //   await pg.insert(projects).values(toInsert);
        // }

        // const chunkSize = 100;

        // for (let i = 0; i < toUpdate.length; i += chunkSize) {
        //   const chunk = toUpdate.slice(i, i + chunkSize);

        //   await Promise.all(
        //     chunk.map((p) =>
        //       pg
        //         .update(projects)
        //         .set({ devlogIds: p.devlogIds })
        //         .where(eq(projects.id, p.id))
        //     )
        //   );
        // }
        // return respond({
        //   text: "All projects from user have been added.",
        //   response_type: "ephemeral",
        // });
        return respond({
          text: "Provide an id.",
          response_type: "ephemeral",
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
            ...(freshProject.data.description
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: String(freshProject.data.description)
                        .split("\n")
                        .map((line: string) => `> ${line}`)
                        .join("\n"),
                    },
                  }
                ] as {
                  type: "section";
                  text: {
                    type: "mrkdwn";
                    text: string;
                  }
                }[]
              : []),
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
