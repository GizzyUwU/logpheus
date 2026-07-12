import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
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
      ...(apiKey ? {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      } : {})
    });
    this.logger = logtape;
    this.ready = Promise.resolve();
  }

  private async request<S extends ZodType<any, any, any>>(
    config: AxiosRequestConfig,
    schema: S,
  ): Promise<
    | { ok: true; status: number; data: z.infer<S> }
    | { ok: false; status: number | null; msg: string | unknown }
  > {
    await this.ready;

    const ctx = this.logger.with({
      request: config.url
    });
    
    try {
      const res = await this.fetch.request(config);
      this.lastCode = res.status;
      try {
        if(res.status === 408) this.logger.warn(`${config.url} timed out`)
        return {
          ok: true,
          status: res.status,
          data: schema.parse(res.data),
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const formatted = error.issues.map((issue) => {
            const path = issue.path
              .map((p) => (typeof p === "number" ? `[${p}]` : p))
              .join(".");
        
            const received = issue.path.reduce(
              (obj: any, key) => obj?.[key],
              res.data
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

  projects(query?: z.infer<typeof ZTypes.ExploreProjectsQueryParams>) {
    const parsedQuery = query
      ? ZTypes.ExploreProjectsQueryParams.parse(query)
      : undefined;

    const queries = new URLSearchParams(
      Object.entries(parsedQuery ?? {}).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    );

    return this.request(
      {
        method: "GET",
        url: "/explore/projects" + (queries.toString() ? `?${queries.toString()}` : ""),
      },
      ZTypes.ExploreProjectsResponse,
    );
  }

  project(param: z.infer<typeof ZTypes.ProjectParams>) {
    const parsedParam = param ? ZTypes.ProjectParams.parse(param) : undefined;

    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/projects/" + parsedParam.id,
      },
      ZTypes.ProjectResponse,
    );
  }

  hackatimeProjects(query: z.infer<typeof ZTypes.HackatimeProjectsQueries>) {
    const parsedQuery = query
      ? ZTypes.HackatimeProjectsQueries.parse(query)
      : undefined;

    const queries = new URLSearchParams(
      Object.entries(parsedQuery ?? {}).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    );

    return this.request(
      {
        method: "GET",
        url: "/hackatime/projects" + (queries.toString() ? `?${queries.toString()}` : ""),
      },
      ZTypes.HackatimeProjectsResponse,
    );
  }

  async hackatimeProject(params: z.infer<typeof ZTypes.HackatimeProjectsParams>, query: z.infer<typeof ZTypes.HackatimeProjectsQueries>) {
    const parsedParam = params ? ZTypes.HackatimeProjectsParams.parse(params) : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    const hackatimeProjects = await this.hackatimeProjects(query);
    if (!hackatimeProjects.ok) return hackatimeProjects;

    const project = hackatimeProjects.data.projects.find(
      (entry) => entry.name === parsedParam.name,
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

  
  hackatimeBreakdown(params: z.infer<typeof ZTypes.HackatimeBreakdownParams>) {
    const parsedParam = params ? ZTypes.HackatimeBreakdownParams.parse(params) : undefined;
    if (!parsedParam) throw new Error("Missing Params");

    return this.request(
      {
        method: "GET",
        url: "/projects/" + parsedParam.projectId + "/hackatime-breakdown",
      },
      ZTypes.HackatimeBreakdownResponse,
    );
  }

  journals(param: z.infer<typeof ZTypes.ProjectParams>) {
    const parsedParam = param ? ZTypes.ProjectParams.parse(param) : undefined;

    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/projects/" + parsedParam.id,
      },
      ZTypes.ProjectJournalsResponse,
    );
  }

  async journal(param: z.infer<typeof ZTypes.ProjectJournalParams>) {
    const parsedParam = param
      ? ZTypes.ProjectJournalParams.parse(param)
      : undefined;

    if (!parsedParam) throw new Error("Missing Params");

    const project = await this.project({ id: parsedParam.projectId });

    if (!project.ok) return project;

    const journal = project.data.journals.find(
      (entry) => entry.id === parsedParam.journalId,
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

  users(query?: z.infer<typeof ZTypes.ExplorePeopleQueryParams>) {
    const parsedQuery = query
      ? ZTypes.ExplorePeopleQueryParams.parse(query)
      : undefined;
    
    const queries = new URLSearchParams(
      Object.entries(parsedQuery ?? {}).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    );

    return this.request(
      {
        method: "GET",
        url: "/explore/people" + (queries.toString() ? `?${queries.toString()}` : ""),
      },
      ZTypes.ExplorePeopleResponse,
    );
  }

  user(param: z.infer<typeof ZTypes.UserParams>) {
    const parsedParam = param ? ZTypes.UserParams.parse(param) : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/users/" + parsedParam.userId,
      },
      ZTypes.UserResponse,
    );
  }

  async userProjects(param: z.infer<typeof ZTypes.UserParams>) {
    const parsedParam = param ? ZTypes.UserParams.parse(param) : undefined;
    if (!parsedParam) throw new Error("Missing Params");

    const user = await this.user(parsedParam);
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

  async shopItem(param: z.infer<typeof ZTypes.ShopItemParams>) {
    const parsedParam = param
      ? ZTypes.ShopItemParams.parse(param)
      : undefined;

    if (!parsedParam) throw new Error("Missing Params");
    const shop = await this.shop();
    if (!shop.ok) return shop;

    const itemData = shop.data.items.find(
      (entry) => entry.id === parsedParam.itemId,
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

  
  shopSuggestions(query?: z.infer<typeof ZTypes.ShopSuggestionQueries>) {
    const parsedQuery = query
      ? ZTypes.ShopSuggestionQueries.parse(query)
      : undefined;

    const queries = new URLSearchParams(
      Object.entries(parsedQuery ?? {}).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    );

    return this.request(
      {
        method: "GET",
        url: "/shop/requests" + (queries.toString() ? `?${queries.toString()}` : ""),
      },
      ZTypes.ShopSuggestionResponse,
    );
  }
}
