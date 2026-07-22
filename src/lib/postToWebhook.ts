import type { SectionBlockAccessory, TextObject } from "@slack/web-api";
import type { Logger } from "@logtape/logtape";

export async function postBlocksToWebhook(
  webhookUrl: string,
  blocks: ({
      type: string;
      text: TextObject;
      accessory: SectionBlockAccessory;
  } | {
      type: "header";
      text: {
          type: "plain_text";
          text: string;
      };
  } | {
      type: "section";
      text: {
          type: "mrkdwn";
          text: string;
      };
  } | {
      type: "context";
      elements: {
          type: "mrkdwn";
          text: string;
          verbatim: false;
      }[];
  } | {
      type: "divider";
  })[],
  text: string,
  logger?: Logger,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        blocks,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      logger
        ?.with({
          status: res.status,
          body,
        })
        .error("Failed to post blocks to Slack webhook");
      return false;
    }

    return true;
  } catch (err) {
    logger
      ?.with({
        error: err,
        message: err instanceof Error ? err.message : String(err),
      })
      .error("Error posting blocks to Slack webhook");
    return false;
  }
}