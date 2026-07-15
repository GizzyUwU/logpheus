import SDJam from "@/lib/sdjam";
import type {
  ApiAdapter,
  ApiResult,
  CanonicalProject,
  CanonicalDevlog,
  CanonicalUser,
  CanonicalShopItem,
  PaginatedResult,
} from "@/lib/adapters/types";
import type { logger as LogType } from "@/index.ts";
import { ZTypes } from "@/lib/sdjam/types";
import { z } from "zod";

export function macondoContentTypeFromUrl(url: string): string {
  const ext =
    (url.split("?").at(0) ?? url).split(".").at(-1)?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
      return "image/jpeg";
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "png":
      return "image/png";
    default:
      return "image/png";
  }
}

export class SDJamAdapter implements ApiAdapter {
  private client: SDJam;
  ready: Promise<void>;

  constructor({ logtape }: { apiKey: string; logtape: typeof LogType }) {
    this.client = new SDJam(logtape);
    this.ready = Promise.resolve();
  }

  get raw(): SDJam {
    return this.client;
  }

  get lastCode(): number {
    return this.client.lastCode ?? 0;
  }

  async project(params: {
    id: number;
  }): Promise<
    ApiResult<
      CanonicalProject,
      z.infer<typeof ZTypes.GetProjectV2Response> | null
    >
  > {
    const res = await this.client.project({ id: params.id });
    if (!res.ok)
      return {
        ok: false,
        status: res.status ?? this.lastCode,
        data: null,
        raw: null,
      };

    return {
      ok: true,
      status: res.status,
      data: {
        id: res.data.id,
        title: res.data.title,
        devlogIds: res.data.devlog_ids ?? [],
      },
      raw: res.data,
    };
  }

  async devlogs(
    params: { project_id: number },
    opts: { page: number },
  ): Promise<
    ApiResult<
      PaginatedResult<CanonicalDevlog>,
      z.infer<typeof ZTypes.ListProjectDevlogsV2Response> | null
    >
  > {
    const res = await this.client.devlogs(
      { id: params.project_id },
      { ...opts, limit: 20 },
    );
    if (!res.ok)
      return {
        ok: false,
        status: res.status ?? this.lastCode,
        data: null,
        raw: null,
      };

    const MD_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;

    return {
      ok: true,
      status: res.status,
      data: {
        items: res.data.devlogs
          ? res.data.devlogs.map((j) => {
              const raw = j.body ?? j.description ?? "";
              const mediaUrls = [...raw.matchAll(MD_IMAGE_RE)]
                .map((m) => m[1])
                .filter((url): url is string => !!url);
              const body = raw.replace(MD_IMAGE_RE, "").trim() || null;
              return {
                id: j.id,
                body,
                duration_seconds: j.duration_seconds ?? 0,
                created_at: j.created_at ?? null,
                media: mediaUrls.map((url) => ({
                  url,
                  content_type: macondoContentTypeFromUrl(url),
                })),
              };
            })
          : [],
        next_page: res.data.pagination?.next_page ?? null,
      },
      raw: res.data,
    };
  }

  async user(): Promise<ApiResult<CanonicalUser, null | null>> {
    // const res = await this.client.user({ userId: params.id });
    // if (!res.ok) return { ok: false, status: res.status ?? this.lastCode, data: null };
    // params: { id: string }

    return {
      ok: true,
      status: 200,
      data: {
        currency: 0,
      },
      raw: null,
    };
  }

  async shop(): Promise<ApiResult<CanonicalShopItem[], null>> {
    // const res = await this.client.shop();
    // if (!res.ok)
    //   return {
    //     ok: false,
    //     status: res.status ?? this.lastCode,
    //     data: null,
    //     raw: null,
    //   };
    return {
      ok: true,
      status: 200,
      data: [],
      raw: null
    };
  }
}
