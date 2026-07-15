import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import type { PlainTextOption } from "@slack/web-api";
import ysws from "@/ysws";

export default {
  name: "config",
  desc: "Need to change the bots configuration on you?",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, callbackId, prefix, folder, yswsData }: RequestHandler,
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

      if (!yswsData || Object.keys(yswsData).length === 0)
        return await respond({
          text: `Gng you don't even got an api key set to this channel run /${prefix}-${folder} add first.`,
          response_type: "ephemeral",
        });

      const name = /^[a-z]/i.test(prefix!)
        ? prefix![0]!.toUpperCase() + prefix!.slice(1)
        : prefix!;

      const regionOptions: PlainTextOption[] = Object.entries(
        ysws.stardance.regions,
      ).map(([code, name]) => ({
        text: {
          type: "plain_text" as const,
          text: String(name),
          emoji: true,
        },
        value: code,
      }));

      const initialOption =
        regionOptions.find(
          (o) => o.value === (yswsData?.region ?? "us").toUpperCase(),
        ) ?? regionOptions[0];

      const jobConfig = ysws.stardance.jobConfig as Partial<
        Record<typeof ysws.stardance.jobs[number], { optional?: boolean }>
      >;
      
      const jobSelection: PlainTextOption[] = ysws.stardance.jobs.flatMap((job) => {
        const config = jobConfig[job];
        if (!config || config.optional === undefined) return [];
        return [
          {
            text: {
              type: "plain_text",
              text: job,
              emoji: true,
            },
            value: job,
          },
        ];
      });
      
      const alrRegisteredJobs = jobSelection.filter((o) =>
        yswsData.registeredJobs?.includes(o.value ?? ""),
      );

      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId!,
          title: {
            type: "plain_text",
            text: "Configure " + name + "!",
          },
          private_metadata: JSON.stringify({
            channel: command.channel_id,
          }),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "This relies on the API made by the user known as Jam meaning it has limited functionality due to scraping.",
              },
            },
            {
              type: "input",
              block_id: "mcAccName",
              label: {
                type: "plain_text",
                text: "What is your account name?",
              },
              element: {
                type: "plain_text_input",
                action_id: "acc_name",
                multiline: false,
                initial_value: yswsData?.accId ?? ""
              },
            },
            // {
            //   type: "input",
            //   block_id: "mcApiKey",
            //   label: {
            //     type: "plain_text",
            //     text: "Want to provide an api key?",
            //   },
            //   element: {
            //     type: "plain_text_input",
            //     action_id: "api_key",
            //     multiline: false,
            //     initial_value: yswsData?.apiKey ?? ""
            //   },
            //   optional: true
            // },
            {
              type: "input",
              block_id: "personal",
              label: {
                type: "plain_text",
                text: "What is your region for regional pricing?",
              },
              element: {
                type: "static_select",
                action_id: "region",
                placeholder: {
                  type: "plain_text",
                  text: "Select your region",
                  emoji: true,
                },
                options: regionOptions,
                initial_option: initialOption!
              },
              optional: false,
            },
            ...(jobSelection.length > 0 ? [{
              type: "input",
              block_id: "jobs",
              label: {
                type: "plain_text",
                text: "What jobs do you want to register to?",
              },
              element: {
                type: "multi_static_select",
                action_id: "jobs",
                placeholder: {
                  type: "plain_text",
                  text: "Select a job",
                  emoji: true,
                },
                options: jobSelection,
                initial_options: alrRegisteredJobs
              },
              optional: true,
            }] : []) as any[],
          ],
          submit: {
            type: "plain_text",
            text: "Submit",
          },
        },
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
