import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import ysws from "@/ysws";

export default {
  name: "data",
  desc: "Look through what data from flavortown the bot has on you!",
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { prefix, userData, yswsData }: RequestHandler,
  ) => {
    const yswsConfig = Object.values(ysws).find(
      (record) => record.id === yswsData?.yswsId,
    );
    const userText = [
      { label: "Channel Id", value: userData?.channel },
      { label: "Disabled", value: yswsData?.disabled },
      {
        label: "Projects",
        value:
          yswsData?.projects && yswsData?.projects.length > 0
            ? yswsData.projects
                .map(
                  (id: string | number) =>
                    `<${yswsConfig?.url + "/projects/" + id}|${id}>`,
                )
                .join(", ")
            : "No projects",
      },
      {
        label: "Opt Outs",
        value: yswsData?.optOuts ? yswsData?.optOuts.join(", ") : "No opt outs",
      },
      {
        label: "Metadata",
        value:
          yswsData?.meta && yswsData?.meta.length > 0
            ? yswsData?.meta.join(", ")
            : "No metadata",
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
            text:
              (/^[a-z]/i.test(prefix!)
                ? prefix![0]?.toUpperCase() + prefix!.slice(1)
                : prefix!) + `'s ${yswsConfig?.humanName} data on you`,
            emoji: true,
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
  },
};
