import type {
  KnownBlock,
  RichTextBlock,
  RichTextElement,
} from "@slack/web-api";

const IMAGE_REGEX = /!\[([^\]]+)]\(([^)]+)\)/g;
const INLINE_REGEX =
  /(?<emoji>:(?<emojiName>[a-zA-Z0-9_.+-]+):)|(?<underline><u>(?<underlineText>.+?)<\/u>)|(?<bold>\*\*(?<boldText>[^*]+)\*\*)|(?<italic>\*(?<italicText>[^*]+)\*)|(?<strike>~~(?<strikeText>[^~]+)~~)|(?<link>\[(?<linkText>.+?)\]\((?<linkUrl>https?:\/\/[^\s)]+)\))|(?<code>`(?<codeText>[^`]+)`)/g;

const CODE_BLOCK_REGEX = /^```/;
const HEADER1_REGEX = /^# /;
const HEADER2_REGEX = /^## /;
const HEADER3_REGEX = /^### /;
const BLOCKQUOTE_REGEX = /^>/;
const TASK_REGEX = /^- \[( |x|X)\] (.+)/;
const UNORDERED_LIST_REGEX = /^- /;
const ORDERED_LIST_REGEX = /^\d+\. /;
const HORIZONTAL_RULE_REGEX = /^---/;

const MARKDOWN_PATTERNS: RegExp[] = [
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

export function parseMarkdownToSlackBlocks(text: string): KnownBlock[] {
  if (!text) return [];
  text = text.replace(IMAGE_REGEX, (match, name, url) => {
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
    const regex = INLINE_REGEX;

    for (const match of s.matchAll(regex)) {
      if ((match.index ?? 0) > cursor) {
        elements.push({ type: "text", text: s.slice(cursor, match.index) });
      }

      const group = match.groups!;
      switch (true) {
        case !!group["emoji"]:
          elements.push({
            type: "emoji",
            name: group["emojiName"]!,
          });
          break;

        case !!group["underline"]:
          elements.push({
            type: "text",
            text: group["underlineText"]!,
            style: { underline: true },
          });
          break;

        case !!group["bold"]:
          elements.push({
            type: "text",
            text: group["boldText"]!,
            style: { bold: true },
          });
          break;

        case !!group["italic"]:
          elements.push({
            type: "text",
            text: group["italicText"]!,
            style: { italic: true },
          });
          break;

        case !!group["strike"]:
          elements.push({
            type: "text",
            text: group["strikeText"]!,
            style: { strike: true },
          });
          break;

        case !!group["link"]:
          elements.push({
            type: "link",
            url: group["linkUrl"]!,
            text: group["linkText"]!,
          });
          break;

        case !!group["code"]:
          elements.push({
            type: "text",
            text: group["codeText"]!,
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

    if (CODE_BLOCK_REGEX.test(line)) {
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

    if (HORIZONTAL_RULE_REGEX.test(line)) {
      blocks.push({ type: "divider" });
      continue;
    }

    if (HEADER3_REGEX.test(line)) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: line.replace(HEADER3_REGEX, ""),
          emoji: true,
        },
      });
      continue;
    }

    if (HEADER2_REGEX.test(line)) {
      blocks.push({
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: parseInline(line.replace(HEADER2_REGEX, "")),
          },
        ],
      } as RichTextBlock);
      continue;
    }

    if (HEADER1_REGEX.test(line)) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: line.replace(HEADER1_REGEX, ""),
          emoji: true,
        },
      });
      continue;
    }

    if (BLOCKQUOTE_REGEX.test(line)) {
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

    const taskMatch = line.match(TASK_REGEX);
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

    if (UNORDERED_LIST_REGEX.test(line)) {
      const content = parseInline(line.replace(UNORDERED_LIST_REGEX, ""));
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

    if (ORDERED_LIST_REGEX.test(line)) {
      blocks.push({
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: parseInline(line) }],
      } as RichTextBlock);
      continue;
    }

    const imageMatch = line.match(IMAGE_REGEX);
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
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}
