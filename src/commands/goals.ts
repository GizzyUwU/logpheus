import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import { getGenericErrorMessage } from "../lib/genericError";
import checkAPIKey from "../lib/apiKeyCheck";
import FT from "../lib/ft";

export default {
  name: "goals",
  params: "[add/remove] [id]",
  desc: "Look at your goals and perhaps remove or add one!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, prefix, logger, clients }: RequestHandler,
  ) => {
    const userData = await pg
      .select()
      .from(users)
      .where(eq(users.userId, command.user_id))
      .limit(1);

    if (userData.length === 0)
      return respond({
        text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
        response_type: "ephemeral",
      });

    const [action, ...ids] = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(" ").filter(Boolean);

    const checkKey = userData[0]?.apiKey;
    const working = await checkAPIKey({
      db: pg,
      apiKey: checkKey,
      logger,
    });

    if (!working.works)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });
    const apiKey = checkKey!;

    let ftClient: FT = clients[apiKey]!;
    if (!ftClient) {
      ftClient = new FT(apiKey, logger);
    }

    let goalsRaw = (working.row![0]?.meta ?? []).find((item) =>
      item.startsWith("Goals::"),
    );

    if (!goalsRaw) {
      goalsRaw = "[]";
    }
    
    const match = goalsRaw.match(/\[(.*?)\]/);
    const goals = match?.[1]
      ? match[1]
          .split(",")
          .map((v) => parseInt(v.trim()))
          .filter((v) => !isNaN(v))
      : [];

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

    if (!action || action.length <= 0) {
      const goalNames = goals
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
    } else {
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

          let metaArr = working.row![0]?.meta ?? [];

          const mergedGoals = Array.from(new Set([...goals, ...validGoalIds]));

          metaArr = metaArr.filter((item) => !item.startsWith("Goals::"));
          metaArr.push(`Goals::[${mergedGoals.join(",")}]`);

          await pg
            .update(users)
            .set({
              meta: metaArr,
            })
            .where(eq(users.apiKey, apiKey));

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

          let metaArr = working.row![0]?.meta ?? [];

          const updatedGoals = goals.filter(
            (goalId) => !validGoalIds.includes(goalId),
          );

          metaArr = metaArr.filter((item) => !item.startsWith("Goals::"));
          metaArr.push(`Goals::[${updatedGoals.join(",")}]`);

          await pg
            .update(users)
            .set({
              meta: metaArr,
            })
            .where(eq(users.apiKey, apiKey));

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
          const goalNames = goals
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
    }
  },
};
