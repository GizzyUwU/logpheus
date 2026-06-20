import Macondo from "@/lib/macondo";
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
import { ZTypes } from "@/lib/macondo/types";
import { z } from "zod";

export function macondoContentTypeFromUrl(url: string): string {
  const ext = (url.split("?").at(0) ?? url).split(".").at(-1)?.toLowerCase() ?? "";
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

export class MacondoAdapter implements ApiAdapter {
  private client: Macondo;
  ready: Promise<void>;

  constructor(_: string | undefined, logtape: typeof LogType) {
    this.client = new Macondo(logtape);
    this.ready = Promise.resolve();
  }

  get raw(): Macondo {
    return this.client;
  }

  get lastCode(): number {
    return this.client.lastCode ?? 0;
  }

  async project(params: { id: number }): Promise<ApiResult<CanonicalProject, z.infer<typeof ZTypes.ProjectResponse> | null>> {
    const res = await this.client.project({ id: params.id });
    if (!res.ok) return { ok: false, status: res.status ?? this.lastCode, data: null, raw: null };

    return {
      ok: true,
      status: res.status,
      data: {
        id: res.data.id,
        title: String(res.data.name),
        devlogIds: res.data.journals.map((j) => j.id),
      },
      raw: res.data
    };
  }

  async devlogs(
    params: { project_id: number },
    opts: { page: number },
  ): Promise<ApiResult<PaginatedResult<CanonicalDevlog>, z.infer<typeof ZTypes.ProjectJournalsResponse> | null>> {
    const res = await this.client.journals({ id: params.project_id });
    if (!res.ok) return { ok: false, status: res.status ?? this.lastCode, data: null, raw: null };
  
    const PAGE_SIZE = 20;
    const start = (opts.page - 1) * PAGE_SIZE;
    const pageItems = res.data.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < res.data.length;
  
    const MD_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  
    return {
      ok: true,
      status: res.status,
      data: {
        items: pageItems.map((j) => {
          const raw = j.long_brief ?? j.short_brief ?? "";
          const mediaUrls = [...raw.matchAll(MD_IMAGE_RE)].map((m) => m[1]).filter((url): url is string => !!url);
          const body = raw.replace(MD_IMAGE_RE, "").trim() || null;
  
          return {
            id: j.id,
            body,
            duration_seconds: Math.round(j.hours ?? 0 * 3600),
            created_at: j.created_at ?? null,
            media: mediaUrls.map((url) => ({
              url,
              content_type: macondoContentTypeFromUrl(url),
            })),
          };
        }),
        next_page: hasMore ? opts.page + 1 : null,
      },
      raw: res.data
    };
  }

  async user(): Promise<ApiResult<CanonicalUser, z.infer<typeof ZTypes.UserResponse> | null>> {
    // const res = await this.client.user({ userId: params.id });
    // if (!res.ok) return { ok: false, status: res.status ?? this.lastCode, data: null };
    // params: { id: string }

    return {
      ok: true,
      status: 200,
      data: {
        currency: 0
      },
      raw: null
    };
  }

  async shop(): Promise<ApiResult<CanonicalShopItem[], z.infer<typeof ZTypes.ShopItemsResponse>["items"] | null>> {
    const res = await this.client.shop();
    if (!res.ok) return { ok: false, status: res.status ?? this.lastCode, data: null, raw: null };
    return {
      ok: true,
      status: res.status,
      data: res.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        baseHours: item.price_hours,
        baseCost: item.price_gold,
        stock: item.stock_remaining ?? null,
        image_url: item.image_url ?? "https://png.pngtree.com/png-vector/20221125/ourlarge/pngtree-no-image-available-icon-flatvector-illustration-pic-design-profile-vector-png-image_40966566.jpg",
        regionalCosts: Object.fromEntries(
          Object.entries(item.regional_pricing ?? {}).map(([region, data]) => [
            region,
            {
              available: data.available ?? true,
              currency: (data.price_hours ?? 0) * 10,
              hours: Math.ceil(((data.price_hours ?? 0) * 10) / 50),
            },
          ])
        ),
      })),
      raw: res.data.items
    };
  }
}