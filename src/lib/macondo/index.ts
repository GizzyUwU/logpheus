import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { ZodType } from "zod";
import type { logger as LogType } from "@/index.ts";
import { ZTypes } from "./types";
import { z } from "zod";

export default class Macondo {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(logtape: typeof LogType, apiKey?: string) {
    this.fetch = axios.create({
      baseURL: "https://macondo.hackclub.com/api",
      timeout: 10000,
      ...(apiKey && apiKey.length > 0
        ? {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        : {}),
    });
    this.logger = logtape;
    this.ready = Promise.resolve();
  }

  private async request<T extends z.ZodType>(
    config: AxiosRequestConfig,
    schema: T,
  ): Promise<
    | Omit<AxiosResponse, 'data'> & {
      ok: boolean;
        data: z.infer<T>;
      }
    | { ok: false; status: number | null; msg: string | unknown }
  > {
    await this.ready;

    const ctx = this.logger.with({
      request: config.url,
    });

    try {
      const res = await this.fetch.request(config);
      this.lastCode = res.status;
      try {
        if (res.status === 408) this.logger.warn(`${config.url} timed out`);
        return {
          ...res,
          ok: true,
          data: schema.parse(res.data)
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const formatted = error.issues.map((issue) => {
            const path = issue.path
              .map((p) => (typeof p === "number" ? `[${p}]` : p))
              .join(".");

            const received = issue.path.reduce(
              (obj: any, key) => obj?.[key],
              res.data,
            );

            return `${path}: expected ${(issue as any).expected ?? "?"}, got ${JSON.stringify(received)} — ${issue.message}`;
          });
          ctx.error("Zod validation failed", {
            schemaDesc: schema.description,
            error: formatted,
          });
          return { ok: false, status: res.status, msg: error.issues };
        } else {
          ctx.error("Unknown parsing error", {
            error,
          });
          return { ok: false, status: res.status, msg: error };
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        let status = err.response?.status ?? err.status ?? null;

        if (
          (!status && err.code === "ECONNABORTED") ||
          (!status && err.message === "timeout of 10000ms exceeded")
        ) {
          status = 408;
        }
        this.lastCode = status;
        return { ok: false, status, msg: err.message };
      }

      return { ok: false, status: null, msg: err };
    }
  }

  projects(query?: z.infer<typeof ZTypes["ExploreProjectsQueryParams"]>) {
    return this.request(
      {
        method: "GET",
        url:
          "/explore/projects",
        params: query
      },
      ZTypes["ExploreProjectsResponse"],
    );
  }

  project(param: z.infer<typeof ZTypes["ProjectParams"]>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + param.id,
      },
      ZTypes["ProjectResponse"],
    );
  }

  hackatimeProjects(query?: z.infer<typeof ZTypes["HackatimeProjectsQueries"]>) {
    return this.request(
      {
        method: "GET",
        url:
          "/hackatime/projects",
        params: query
      },
      ZTypes["HackatimeProjectsResponse"],
    );
  }

  async hackatimeProject(
    params: z.infer<typeof ZTypes["HackatimeProjectsParams"]>,
    query?: z.infer<typeof ZTypes["HackatimeProjectsQueries"]>,
  ) {
    const hackatimeProjects = await this.hackatimeProjects(query);
    if (!hackatimeProjects.ok) return hackatimeProjects;

    const project = hackatimeProjects.data.projects.find(
      (entry) => entry.name === params.name,
    );

    if (!project) {
      return {
        ok: false as const,
        status: 404,
        msg: "Hackatime project not found",
      };
    }

    return {
      ok: true as const,
      status: hackatimeProjects.status,
      data: project,
    };
  }

  hackatimeBreakdown(params: z.infer<typeof ZTypes["HackatimeBreakdownParams"]>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + params.projectId + "/hackatime-breakdown",
      },
      ZTypes["HackatimeBreakdownResponse"],
    );
  }

  journals(param: z.infer<typeof ZTypes["ProjectParams"]>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + param.id,
      },
      ZTypes["ProjectJournalsResponse"],
    );
  }

  async journal(param: z.infer<typeof ZTypes["ProjectJournalParams"]>) {
    const project = await this.project({ id: param.projectId });

    if (!project.ok) return project;

    const journal = project.data.journals.find(
      (entry) => entry.id === param.journalId,
    );

    if (!journal) {
      return {
        ok: false as const,
        status: 404,
        msg: "Journal not found",
      };
    }

    return {
      ok: true as const,
      status: project.status,
      data: journal,
    };
  }

  users(query?: z.infer<typeof ZTypes["ExplorePeopleQueryParams"]>) {
    return this.request(
      {
        method: "GET",
        url:
          "/explore/people",
        params: query
      },
      ZTypes.ExplorePeopleResponse,
    );
  }

  user(param: z.infer<typeof ZTypes.UserParams>) {
    return this.request(
      {
        method: "GET",
        url: "/users/" + param.userId,
      },
      ZTypes.UserResponse,
    );
  }

  async userProjects(param: z.infer<typeof ZTypes.UserParams>) {
    const user = await this.user(param);
    if (!user.ok) return user;
    if (!user.data.projects) {
      return {
        ok: false as const,
        status: 404,
        msg: "No projects not found",
      };
    }

    return {
      ok: true as const,
      status: user.status,
      data: user.data.projects,
    };
  }

  // userProjects(param: z.infer<typeof FTTypes.ListUserProjectsQueryParams>) {
  //   const parsedParam = param
  //     ? FTTypes.ListUserProjectsQueryParams.parse(param)
  //     : undefined;
  //   if (!parsedParam) throw new Error("Missing Params");
  //   return this.request(
  //     {
  //       method: "GET",
  //       url: "/users/" + parsedParam.id + "/projects",
  //     },
  //     FTTypes.ListUserProjectsResponse,
  //   );
  // }

  shop() {
    return this.request(
      {
        method: "GET",
        url: "/shop/items",
      },
      ZTypes.ShopItemsResponse,
    );
  }

  async shopItem(param: z.infer<typeof ZTypes["ShopItemParams"]>) {
    const shop = await this.shop();
    if (!shop.ok) return shop;

    const itemData = shop.data.items.find(
      (entry) => entry.id === param.itemId,
    );

    if (!shop) {
      return {
        ok: false as const,
        status: 404,
        msg: "Item not found",
      };
    }

    return {
      ok: true as const,
      status: shop.status,
      data: itemData,
    };
  }

  shopSuggestions(query?: z.infer<typeof ZTypes["ShopSuggestionQueries"]>) {
    return this.request(
      {
        method: "GET",
        url:
          "/shop/requests",
        params: query
      },
      ZTypes.ShopSuggestionResponse,
    );
  }

  me() {
    return this.request(
      {
        method: "GET",
        url: "/auth/me",
      },
      ZTypes.GetMeResponse,
    );
  }

  streak() {
    return this.request(
      {
        method: "GET",
        url: "/profile/streaks",
      },
      ZTypes.GetMyStreak,
    );
  }
}
