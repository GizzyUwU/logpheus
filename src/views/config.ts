import type { AckFn, ViewOutput, RespondArguments, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { apiKeys } from "../schema/apiKeys";
import { eq } from "drizzle-orm";
import FT from "../lib/ft";

export default {
    name: "logpheus_config",
    execute: async ({ ack, view, client, respond }: {
        ack: AckFn<string | RespondArguments>
        view: ViewOutput
        client: WebClient
        respond: RespondFn
    }, { pg }: {
        pg: PgliteDatabase<Record<string, never>> & {
            $client: PGlite;
        }
    }) => {
        const userIdBlock = view.blocks.find(
            (block): block is { type: "section"; text: { text: string } } =>
                block.type === "section" && "text" in block
        );
        const userId = userIdBlock?.text?.text.slice("User: ".length);
        const channelId = view.title.text;
        if (!channelId || !userId) return await ack("No channel or user id");
        await ack();
        const values = view.state.values;
        const apiKey = values.ftApiKey?.api_input?.value?.trim();
        if (!apiKey) return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: 'Flavortown API key is required',
        });
        if (apiKey.startsWith("ft_sk_") === false) return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: 'Flavortown API key is invalid every api key should start with ft_sk_',
        });
        if (apiKey.length !== 46) return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: 'Flavortown API key is invalid every api key should be 46 characters long',
        });
        const ftClient = new FT(apiKey)
        await ftClient.user({ id: "me" })
        if (ftClient.lastCode === 401) return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: 'Flavortown API Key is invalid, provide a valid one.',
        });

        const dbData = await pg.select()
            .from(apiKeys)
            .where(eq(apiKeys.channel, channelId))
        if (dbData.length === 0) return await ack('No entry found for this channel ID');

        await pg.update(apiKeys)
            .set({
                apiKey
            }).where(eq(apiKeys.channel, channelId))

        return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "API key has been updated",
        })
    }
};
