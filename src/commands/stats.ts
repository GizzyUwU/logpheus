import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "../index";
import { count } from "drizzle-orm";
import { users } from "../schema/users";
import { heapStats } from "bun:jsc";

export default {
  name: "stats",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { pg, logger }: RequestHandler,
  ) => {
    try {
      const jsHeap = heapStats();
      const mem = process.memoryUsage();
      const cpuStart = process.cpuUsage();
      const sTime = performance.now();
      const result = await pg.select({ count: count() }).from(users);
      const recordCount = result[0]?.count || 0;
      await new Promise((resolve) => setTimeout(resolve, 100));
      const cpuEnd = process.cpuUsage(cpuStart);
      const eTime = performance.now();
      const elapsedMS = eTime - sTime;
      const totalCPUTime = (cpuEnd.user + cpuEnd.system) / 1000;
      const cpuPercent = ((totalCPUTime / elapsedMS) * 100).toFixed(1);
      const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

      const statsText = [
        {
          label: "JS Heap",
          value: `${toMB(jsHeap.heapSize)}MB Used of ${toMB(jsHeap.heapCapacity)}MB`,
        },
        {
          label: "Memory (RSS)",
          value: `${toMB(mem.rss)}MB`,
        },
        {
          label: "CPU Usage:",
          value: `${cpuPercent}%`,
        },
        {
          label: "Objects in Heap",
          value: jsHeap.objectCount,
        },
      ]
        .map((f) => `*${f.label}*: ${f.value}`)
        .join("\n");
      await respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: `There ${recordCount === 1 ? "is" : "are"} ${recordCount} record${recordCount === 1 ? "" : "s"} in the database indicating the amount of users.`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: statsText,
            },
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
          text: "An unexpected error occurred. Check logs.",
          response_type: "ephemeral",
        });
      }
    }
  },
};
