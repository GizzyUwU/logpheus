import type {
  KnownBlock,
  RichTextBlock,
  RichTextElement,
} from "@slack/web-api";

export function parseMarkdownToSlackBlocks(text: string): KnownBlock[] {
  if (!text) return [];
  text = text.replace(/!\[([^\]]+)]\(([^)]+)\)/g, (match, name, url) => {
    try {
      const decoded = decodeURIComponent(url);

      if (decoded.includes("emoji.slack-edge.com")) {
        return `:${name}:`;
      }

      return match;
    } catch {
      return match;
    }
  });

  const blocks: KnownBlock[] = [];
  const lines = text.split("\n");
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const parseInline = (s: string): RichTextElement[] => {
    const elements: RichTextElement[] = [];
    let cursor = 0;
    const regex =
      /(?<emoji>:(?<emojiName>[a-zA-Z0-9_.+-]+):)|(?<underline><u>(?<underlineText>.+?)<\/u>)|(?<bold>\*\*(?<boldText>[^*]+)\*\*)|(?<italic>\*(?<italicText>[^*]+)\*)|(?<strike>~~(?<strikeText>[^~]+)~~)|(?<link>\[(?<linkText>.+?)\]\((?<linkUrl>https?:\/\/[^\s)]+)\))|(?<code>`(?<codeText>[^`]+)`)/g;

    for (const match of s.matchAll(regex)) {
      if ((match.index ?? 0) > cursor) {
        elements.push({ type: "text", text: s.slice(cursor, match.index) });
      }

      const group = match.groups!;
      switch (true) {
        case !!group.emoji:
          elements.push({
            type: "emoji",
            name: group.emojiName!,
          });
          break;

        case !!group.underline:
          elements.push({
            type: "text",
            text: group.underlineText!,
            style: { underline: true },
          });
          break;

        case !!group.bold:
          elements.push({
            type: "text",
            text: group.boldText!,
            style: { bold: true },
          });
          break;

        case !!group.italic:
          elements.push({
            type: "text",
            text: group.italicText!,
            style: { italic: true },
          });
          break;

        case !!group.strike:
          elements.push({
            type: "text",
            text: group.strikeText!,
            style: { strike: true },
          });
          break;

        case !!group.link:
          elements.push({
            type: "link",
            url: group.linkUrl!,
            text: group.linkText!,
          });
          break;

        case !!group.code:
          elements.push({
            type: "text",
            text: group.codeText!,
            style: { code: true },
          });
          break;
      }

      cursor = (match.index ?? 0) + match[0].length;
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
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: line.replace(/^### /, ""),
          emoji: true,
        },
      });
      continue;
    }

    if (/^## /.test(line)) {
      blocks.push({
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: parseInline(line.replace(/^## /, "")),
          },
        ],
      } as RichTextBlock);
      continue;
    }

    if (/^# /.test(line)) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: line.replace(/^# /, ""),
          emoji: true,
        },
      });
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
              ...content.map((e) =>
                checked && e.type === "text"
                  ? { ...e, style: { ...e.style, strike: true } }
                  : e,
              ),
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
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: "•" + " " }, ...content],
          },
        ],
      } as RichTextBlock);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      blocks.push({
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: parseInline(line) }],
      } as RichTextBlock);
      continue;
    }

    const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      blocks.push({
        type: "image",
        image_url: imageMatch[2]!,
        alt_text: imageMatch[1] || "image",
      });
      continue;
    }

    if (!line) {
      blocks.push({
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: " " }],
          },
        ],
      } as RichTextBlock);
      continue;
    }

    blocks.push({
      type: "rich_text",
      elements: [{ type: "rich_text_section", elements: parseInline(line) }],
    } as RichTextBlock);
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
    /<u>[^<]+<\/u>/,
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}
