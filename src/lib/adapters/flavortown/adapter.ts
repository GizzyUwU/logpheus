import FT from "@/lib/ft/index";
import type {
  ApiAdapter,
  ApiResult,
  CanonicalProject,
  CanonicalDevlog,
  CanonicalUser,
  CanonicalShopItem,
  PaginatedResult,
  RegionalCost,
} from "@/lib/adapters/types";
import type { logger as LogType } from "@/index.ts";

export class FTAdapter implements ApiAdapter {
  private client: FT;
  ready: Promise<void>;
  constructor({
    apiKey,
    logtape,
  }: {
    apiKey: string;
    logtape: typeof LogType;
  }) {
    this.client = new FT(apiKey, logtape);
    this.ready = Promise.resolve();
  }

  get raw(): FT {
    return this.client;
  }

  get lastCode(): number {
    return this.client.lastCode ?? 0;
  }

  async project(params: { id: number }): Promise<ApiResult<CanonicalProject>> {
    const res = await this.client.project({ id: params.id });
    if (!res.ok || !res.data) return { ok: false, status: res.status ?? 500, data: null, raw: null };
    return {
      ok: true,
      status: res.status,
      data: {
        id: Number(res.data.id),
        title: res.data.title ?? "Unknown",
        devlogIds: Array.isArray(res.data.devlog_ids) ? res.data.devlog_ids.map(Number) : [],
      },
      raw: res.data
    };
  }

  async devlogs(
    params: { project_id: number },
    opts: { page: number },
  ): Promise<ApiResult<PaginatedResult<CanonicalDevlog>>> {
    const res = await this.client.devlogs(
      { project_id: params.project_id },
      { page: opts.page },
    );
    if (!res.ok || !res.data) return { ok: false, status: res.status ?? 500, data: null, raw: null };
    return {
      ok: true,
      status: res.status,
      data: {
        items: (res.data.devlogs ?? []).map((d) => ({
          id: Number(d.id),
          body: d.body ?? null,
          duration_seconds: Number(d.duration_seconds ?? 0),
          created_at: d.created_at ?? null,
          media: (d.media ?? []).map((m) => ({
            url: m.url ?? "",
            content_type: m.content_type ?? "",
          })),
        })),
        next_page: res.data.pagination?.next_page ?? null,
      },
      raw: res.data
    };
  }

  async user(params: { id: string }): Promise<ApiResult<CanonicalUser>> {
    const res = await this.client.user({ id: params.id });
    if (!res.ok || !res.data) return { ok: false, status: res.status ?? 500, data: null, raw: null };
    return {
      ok: true,
      status: res.status,
      data: {
        currency: Number(res.data.cookies ?? 0),
      },
      raw: res.data
    };
  }

  async shop(): Promise<ApiResult<CanonicalShopItem[]>> {
    const res = await this.client.shop();
    if (!res.ok || !res.data) return { ok: false, status: res.status ?? 500, data: null, raw: null };
    return {
      ok: true,
      status: res.status,
      data: res.data.map((item) => ({
        id: Number(item.id),
        name: String(item.name),
        description: item.description ?? "",
        baseHours: 0,
        baseCost: item.ticket_cost?.base_cost ?? 0,
        stock: item.stock ?? null,
        image_url: item.image_url ?? "https://png.pngtree.com/png-vector/20221125/ourlarge/pngtree-no-image-available-icon-flatvector-illustration-pic-design-profile-vector-png-image_40966566.jpg",
        regionalCosts: Object.fromEntries(
          (["au", "ca", "eu", "in", "uk", "us", "xx"] as const)
            .filter((k) => item.ticket_cost?.[k] != null)
            .map((k) => [
              k,
              {
                available: true,
                currency: item.ticket_cost![k]!,
                hours: 0,
              } satisfies RegionalCost,
            ]),
        ),
      })),
      raw: res.data
    };
  }
}
