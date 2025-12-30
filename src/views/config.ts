import type { AckFn, ViewOutput, RespondArguments } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Database } from "bun:sqlite";

export default {
    name: "logpheus_config",
    execute: async ({ ack, view, client }: {
        ack: AckFn<string | RespondArguments>
        view: ViewOutput
        client: WebClient
    }, { db }: { db: Database }) => {
        const values = view.state.values;
        const apiKey = values.ftApiKey?.api_input?.value?.trim();
        if (!apiKey) return await ack('Flavortown API key is required');
        if (apiKey.startsWith("ft_sk_") === false) return await ack('Flavortown API key is invalid every api key should start with ft_sk_');
        if (apiKey.length !== 46) return await ack('Flavortown API key is invalid every api key should be 46 characters long');
        const channelId = view.title.text;
        const userIdBlock = view.blocks.find(
            (block): block is { type: "section"; text: { text: string } } =>
                block.type === "section" && "text" in block
        );
        const userId = userIdBlock?.text?.text.slice("User: ".length);
        if (!channelId || !userId) return await ack("No channel or user id");

        const existingRow = db.prepare(`SELECT * FROM api_keys WHERE channel = ?`).get(channelId) as { api_key: string; projects: string } | undefined;
        if (!existingRow) return await ack('No entry found for this channel ID');

        await ack();

        db.prepare(`
            INSERT INTO api_keys (api_key, channel, projects)
            VALUES (?, ?, ?)
            ON CONFLICT(channel) DO UPDATE SET
                api_key = excluded.api_key,
                projects = excluded.projects
        `).run(apiKey, channelId, existingRow.projects);

        return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "The API key has been updated."
        });
    }
};
