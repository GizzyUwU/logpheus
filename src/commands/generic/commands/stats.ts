import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { count } from "drizzle-orm";
import { users } from "@/schema/users";
import { heapStats } from "bun:jsc";
import { projects as projectTable } from "@/schema";

export default {
  name: "stats",
  desc: "View the stats like cpu usage, memory usage or amount of users that we have!",
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
      await new Promise((resolve) => setTimeout(resolve, 100));
      const cpuEnd = process.cpuUsage(cpuStart);
      const eTime = performance.now();
      const elapsedMS = eTime - sTime;
      const totalCPUTime = (cpuEnd.user + cpuEnd.system) / 1000;
      const cpuPercent = ((totalCPUTime / elapsedMS) * 100).toFixed(1);
      const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
      const projects = await pg.select({ userId: projectTable.userId }).from(projectTable);
      const jobUsers = [...new Set(projects.map(r => r.userId))];
      const statsText = [
        {
          label: "Registered Users",
          value: result[0]?.count || 0
        },
        {
          label: "Job Users",
          value: jobUsers.length
        },
        {
          label: "Registered projects",
          value: projects.length
        },
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
              text: `Statstics! My Favourite!`,
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
