import type { KnownBlock, RichTextBlock, RichTextElement } from "@slack/web-api";

export function parseMarkdownToSlackBlocks(text: string): KnownBlock[] {
    if (!text) return [];
    const blocks: KnownBlock[] = [];
    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    const parseInline = (s: string): RichTextElement[] => {
        const elements: RichTextElement[] = [];
        let cursor = 0;
        const regex =
            /(<u>(.+?)<\/u>)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|\[(.+?)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`/g;
        let match;

        while ((match = regex.exec(s)) !== null) {
            if (match.index > cursor) {
                elements.push({ type: "text", text: s.slice(cursor, match.index) });
            }

            if (match[1]) {
                elements.push({ type: "text", text: match[2]!, style: { underline: true } });
            } else if (match[3]) {
                elements.push({ type: "text", text: match[4]!, style: { bold: true } });
            } else if (match[5]) {
                elements.push({ type: "text", text: match[6]!, style: { italic: true } });
            } else if (match[7]) {
                elements.push({ type: "text", text: match[8]!, style: { strike: true } });
            } else if (match[9]) {
                elements.push({ type: "link", url: match[10]!, text: match[9]! });
            } else if (match[11]) {
                elements.push({ type: "text", text: match[11]!, style: { code: true } });
            }

            cursor = regex.lastIndex;
        }

        if (cursor < s.length) {
            elements.push({ type: "text", text: s.slice(cursor) });
        }

        return elements;
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();

        if (/^```/.test(line)) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBuffer = [];
            } else {
                blocks.push({
                    type: "section",
                    text: { type: "mrkdwn", text: "```" + codeBuffer.join("\n") + "```" },
                });
                inCodeBlock = false;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBuffer.push(rawLine);
            continue;
        }

        if (line === "---") {
            blocks.push({ type: "divider" });
            continue;
        }

        if (/^### /.test(line)) {
            blocks.push({ type: "header", text: { type: "plain_text", text: line.replace(/^### /, ""), emoji: true } });
            continue;
        }

        if (/^## /.test(line)) {
            blocks.push({
                type: "rich_text",
                elements: [{ type: "rich_text_section", elements: parseInline(line.replace(/^## /, "")),}],
            } as RichTextBlock);
            continue;
        }

        if (/^# /.test(line)) {
            blocks.push({ type: "header", text: { type: "plain_text", text: line.replace(/^# /, ""), emoji: true } });
            continue;
        }

        if (/^>/.test(line)) {
            blocks.push({
                type: "rich_text",
                elements: [
                    {
                        type: "rich_text_quote",
                        elements: parseInline(line.replace(/^>\s?/, "")),
                    },
                ],
            } as RichTextBlock);
            continue;
        }

        const taskMatch = line.match(/^- \[( |x|X)\] (.+)/);
        if (taskMatch) {
            const checked = taskMatch[1]!.toLowerCase() === "x";
            const content = parseInline(taskMatch[2]!);
            blocks.push({
                type: "rich_text",
                elements: [
                    {
                        type: "rich_text_section",
                        elements: [
                            { type: "text", text: "• " },
                            ...content.map((e) => (checked && e.type === "text" ? { ...e, style: { ...e.style, strike: true } } : e)),
                        ],
                    },
                ],
            } as RichTextBlock);
            continue;
        }

        if (/^- /.test(line)) {
            const content = parseInline(line.replace(/^- /, ""));
            blocks.push({
                type: "rich_text",
                elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "•" + " " }, ...content] }],
            } as RichTextBlock);
            continue;
        }

        if (/^\d+\. /.test(line)) {
            blocks.push({ type: "rich_text", elements: [{ type: "rich_text_section", elements: parseInline(line) }] } as RichTextBlock);
            continue;
        }

        const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imageMatch) {
            blocks.push({ type: "image", image_url: imageMatch[2]!, alt_text: imageMatch[1] || "image" });
            continue;
        }

        if (!line) {
            blocks.push({ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "text", text: " " }] }] } as RichTextBlock);
            continue;
        }

        blocks.push({ type: "rich_text", elements: [{ type: "rich_text_section", elements: parseInline(line) }] } as RichTextBlock);
    }

    return blocks;
}

export function containsMarkdown(text: string): boolean {
    if (!text) return false;

    const markdownPatterns: RegExp[] = [
        /^#{1,6}\s.+/m,
        /\*\*[^*]+\*\*/,
        /\*[^*]+\*/,
        /~~[^~]+~~/,
        /`[^`]+`/,
        /^```[\s\S]*```/m,
        /^>.+/m,
        /^- \[( |x|X)\] .+/m,
        /^- .+/m,
        /^\d+\. .+/m,
        /!\[[^\]]*\]\([^)]+\)/,
        /\[[^\]]+\]\([^)]+\)/,
        /<u>[^<]+<\/u>/
    ];

    return markdownPatterns.some(pattern => pattern.test(text));
}
