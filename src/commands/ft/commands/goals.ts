import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import FT from "@/lib/ft/index";
import { yswsUsers } from "@/schema/ysws";

export default {
  name: "goals",
  params: "[add/remove] [id]",
  desc: "Look at your goals and perhaps remove or add one!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, prefix, logger, yswsClient, folder, yswsData, yswsId }: RequestHandler & { yswsId: number },
  ) => {
    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });

    const [action, ...ids] = command.text
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(" ")
      .filter(Boolean);

    const apiKey = String(yswsData?.apiKey);
    const working = await checkAPIKey({
      db: pg,
      apiKey,
      yswsData: yswsData!,
      userId: command.user_id,
      logger,
    });

    if (!working.works)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-${folder} config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    let ftClient: FT = yswsClient.raw as FT;

    const items = await ftClient.shop();

    if (!items || !items.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!items.ok || !items.data?.length) {
      switch (items.status) {
        default:
          const msg = getGenericErrorMessage(items.status, prefix!);
          return respond({
            text: msg ?? "Unexpected error has occured!",
            response_type: "ephemeral",
          });
      }
    }

    if (yswsData?.goals && (!action || action.length <= 0)) {
      const goalNames = yswsData.goals
        .map((goalId) => items.data.find((item) => item.id === goalId))
        .filter(Boolean)
        .map((item) => ({
          id: item!.id,
          name: item!.name,
        }));

      return respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "*Goals*:\n" +
                (goalNames.length
                  ? goalNames
                      .map((item) => `• ${item.name} - ${item.id}`)
                      .join("\n")
                  : "You have no goals set."),
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: "Format as 'Name - ID'",
              },
            ],
          },
        ],
        response_type: "ephemeral",
      });
    } else if (yswsData?.goals && action) {
      switch (action) {
        case "add": {
          const parsedIds = ids
            .map((v) => parseInt(v))
            .filter((v) => !isNaN(v));

          if (parsedIds.length === 0) {
            return respond({
              text: "Please provide valid goal IDs to add.",
              response_type: "ephemeral",
            });
          }

          const validGoalIds = parsedIds.filter((id) =>
            items.data.some((item) => item.id === id),
          );

          if (validGoalIds.length === 0) {
            return respond({
              text: "None of the provided IDs are valid goals.",
              response_type: "ephemeral",
            });
          }

          const mergedGoals = Array.from(
            new Set([...yswsData.goals, ...validGoalIds]),
          );

          await pg
            .update(yswsUsers)
            .set({
              goals: mergedGoals,
            })
            .where(
              and(
                eq(yswsUsers.userId, command.user_id),
                eq(yswsUsers.yswsId, yswsId),
              ),
            );

          const goalNames = mergedGoals
            .map((goalId) => items.data.find((item) => item.id === goalId))
            .filter(Boolean)
            .map((item) => ({
              id: item!.id,
              name: item!.name,
            }));

          return respond({
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*Updated goals*:\n" +
                    goalNames
                      .map((item) => `• ${item.name} - ${item.id}`)
                      .join("\n"),
                },
              },

              {
                type: "context",
                elements: [
                  {
                    type: "plain_text",
                    text: "Format as 'Name - ID'",
                  },
                ],
              },
            ],
            response_type: "ephemeral",
          });
        }

        case "remove": {
          const parsedIds = ids
            .map((v) => parseInt(v))
            .filter((v) => !isNaN(v));

          if (parsedIds.length === 0) {
            return respond({
              text: "Please provide valid goal IDs to remove.",
              response_type: "ephemeral",
            });
          }

          const validGoalIds = parsedIds.filter((id) =>
            items.data.some((item) => item.id === id),
          );

          if (validGoalIds.length === 0) {
            return respond({
              text: "None of the provided IDs are valid goals.",
              response_type: "ephemeral",
            });
          }

          const updatedGoals = yswsData.goals.filter(
            (goalId) => !validGoalIds.includes(goalId),
          );

          await pg
            .update(yswsUsers)
            .set({
              goals: updatedGoals,
            })
            .where(
              and(
                eq(yswsUsers.userId, command.user_id),
                eq(yswsUsers.yswsId, yswsId),
              ),
            );

          const goalNames = updatedGoals
            .map((goalId) => items.data.find((item) => item.id === goalId))
            .filter(Boolean)
            .map((item) => ({
              id: item!.id,
              name: item!.name,
            }));

          return respond({
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: goalNames.length
                    ? "*Updated goals*:\n" +
                      goalNames
                        .map((item) => `• ${item.name} - ${item.id}`)
                        .join("\n")
                    : "You have no goals set.",
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "plain_text",
                    text: "Format as 'Name - ID'",
                  },
                ],
              },
            ],
            response_type: "ephemeral",
          });
        }

        default: {
          const goalNames = yswsData.goals
            .map((goalId) => items.data.find((item) => item.id === goalId))
            .filter(Boolean)
            .map((item) => ({
              id: item!.id,
              name: item!.name,
            }));

          return respond({
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*Goals*:\n" +
                    (goalNames.length
                      ? goalNames
                          .map((item) => `• ${item.name} - ${item.id}`)
                          .join("\n")
                      : "You have no goals set."),
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "plain_text",
                    text: "Format as 'Name - ID'",
                  },
                ],
              },
            ],
            response_type: "ephemeral",
          });
        }
      }
    } else
      return respond({
        text: "You provided no action and have no goals! Provide an action next time.",
        response_type: "ephemeral",
      });
  },
};
