import yswsConfig from "@/ysws";
import { and, arrayContains, eq, isNull, not, or } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { yswsUsers } from "@/schema";
import { loadAdapter } from "@/lib/adapters";
import type Macondo from "@/lib/macondo";
import { getGenericErrorMessage } from "@/lib/genericError";
type YSWSRow = typeof yswsUsers._.inferSelect;

export default {
  name: "scanFoMCStreak",
  execute: async ({ client, clients, pg, logger, prefix }: RequestHandler) => {
    try {
      const userRows = (
        await pg.query.users.findMany({
          columns: {
            userId: true,
            channel: true,
          },
          with: {
            ysws: {
              columns: {
                yswsId: true,
                apiKey: true,
                meta: true,
              },
              where: and(
                arrayContains(yswsUsers.registeredJobs, ["scanForMCStreak"]),
                or(
                  isNull(yswsUsers.meta),
                  not(
                    arrayContains(yswsUsers.meta, [
                      "StreakMet::" + new Date().toISOString().split("T")[0],
                    ]),
                  ),
                ),
              ),
            },
          },
        })
      ).filter((u) => u.ysws.length > 0);
      if (!userRows || userRows.length === 0) return;
      const seenProjectIds = new Set<number>();
      for (const user of userRows) {
        if (!user || !user.channel || !user.userId || !user.ysws[0]!.apiKey)
          continue;
        const yswsData = user.ysws[0]!;
        const clientKey = `${yswsData.yswsId}:${user.userId ?? crypto.randomUUID()}`;
        console.log(clientKey);
        if (!clients[clientKey]) {
          const AdapterClass = await loadAdapter(yswsConfig.macondo.adapter);
          clients[clientKey] = new AdapterClass({
            apiKey: yswsData.apiKey,
            logtape: logger,
          });
        }

        const yswsClient = clients[clientKey].raw as Macondo;
        let streak = await yswsClient.streak();
        if (!streak || !streak.status) {
          const ctx = logger.with({
            status: streak?.status,
            ok: streak?.ok,
          });
          ctx.error(
            "scanForMCStreak failed because streak api failed to work correctly",
          );
          continue;
        }

        if (!streak.ok || !Object.keys(streak.data)?.length) {
          if (streak.status === 200) {
            logger.warn("API returned data with no items which is unexpected.");
            continue;
          }

          const msg = getGenericErrorMessage(streak.status, prefix!);
          if (msg === "Server is down!" || msg === "Server timed out!") break;

          const ctx = logger.with({
            msg,
            status: streak.status,
            ok: streak.ok,
          });
          ctx.error(
            "scanForMCStreak failed because streak api failed to work correctly",
          );
          continue;
        }

        const streakCopy = streak;
        const incomingProjectIds = streakCopy.data.projects.map((p) => p.id);
        const isStale = incomingProjectIds.some((id) => seenProjectIds.has(id));
        if (isStale) {
          await new Promise((res) => setTimeout(res, 10000));
          const streakRetry = await yswsClient.streak();
          if (!streakRetry || !streakRetry.status) {
            const ctx = logger.with({
              status: streak?.status,
              ok: streak?.ok,
            });
            ctx.error(
              "scanForMCStreak failed because streak api failed to work correctly",
            );
            continue;
          }

          if (!streakRetry.ok || !Object.keys(streakRetry.data)?.length) {
            if (streakRetry.status === 200) {
              logger.warn(
                "API returned data with no items which is unexpected.",
              );
              continue;
            }

            const msg = getGenericErrorMessage(streak.status, prefix!);
            if (msg === "Server is down!" || msg === "Server timed out!") break;

            const ctx = logger.with({
              msg,
              status: streak.status,
              ok: streak.ok,
            });
            ctx.error(
              "scanForMCStreak failed because streak api failed to work correctly",
            );
            continue;
          }

          const retriedProjectIds = streakRetry.data.projects.map((p) => p.id);
          const stillStale = retriedProjectIds.some((id) =>
            seenProjectIds.has(id),
          );

          if (stillStale) {
            logger.error(
              "Streak response still stale after retry, skipping user this cycle",
              {
                userId: user.userId,
                projectIds: retriedProjectIds,
              },
            );
            continue;
          }

          streak = streakRetry;
        }

        for (const p of streak.data.projects) seenProjectIds.add(p.id);

        if (
          (streak.data.today_seconds_logged ?? 0) >=
            streak.data.daily_goal_seconds &&
          streak.data.worked_today
        ) {
          console.log("aaa");
          const updateFields: Partial<YSWSRow> = {};
          const filteredMeta = (yswsData.meta ?? []).filter(
            (i) => !i.startsWith("StreakMet::"),
          );
          updateFields.meta = [
            ...filteredMeta,
            "StreakMet::" + new Date().toISOString().split("T")[0],
          ];
          await pg
            .update(yswsUsers)
            .set(updateFields)
            .where(
              and(
                eq(yswsUsers.userId, user.userId),
                eq(yswsUsers.yswsId, yswsData.yswsId),
              ),
            );

          void client.chat.postMessage({
            channel: user.channel,
            markdown_text: `:yay: <@${user.userId}> has added onto their streak today! their macondo streak is now at ${streak.data.current_streak}.`,
          });
        } else continue;
      }
    } catch (e) {
      const ctx = logger.with({
        error: e,
      });
      ctx.error("An error occured with scnaForMCStreak");
    }
  },
};
