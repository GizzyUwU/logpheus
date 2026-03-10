import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";
import type { logger as LogType } from "..";
import * as ZTypes from "./ft.zod";
import { z } from "zod";

export default class FT {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(apiKey: string, logtape: typeof LogType) {
    if (!apiKey) throw new Error("FT API Key is required");
    this.fetch = axios.create({
      baseURL: "https://flavortown.hackclub.com/api/v1",
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Flavortown-Ext-1865": true,
      },
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

    try {
      const res = await this.fetch.request(config);
      this.lastCode = res.status;
      try {
        return {
          ok: true,
          status: res.status,
          data: schema.parse(res.data),
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          this.logger.error("Zod validation failed", {
            error: error.issues,
          });
          return { ok: false, status: res.status, msg: error.issues };
        } else {
          this.logger.error("Unknown parsing error", {
            error,
          });
          return { ok: false, status: res.status, msg: error };
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status ?? err.status ?? null;
        this.lastCode = status;
        return { ok: false, status, msg: err.message };
      }

      return { ok: false, status: null, msg: err };
    }
  }

  projects(query?: unknown) {
    const parsedQuery = query
      ? ZTypes.ListProjectsQueryParams.parse(query)
      : undefined;

    return this.request(
      {
        method: "GET",
        url: "/projects",
        params: parsedQuery,
      },
      ZTypes.ListProjectsResponse,
    );
  }

  project(param: unknown) {
    const parsedParam = param
      ? ZTypes.GetProjectParams.parse(param)
      : undefined;

    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/projects/" + parsedParam.id,
      },
      ZTypes.GetProjectResponse,
    );
  }

  devlogs(param: unknown, query?: unknown) {
    const parsedParam = param
      ? ZTypes.ListProjectDevlogsParams.parse(param)
      : undefined;
    const parsedQuery = query
      ? ZTypes.ListDevlogsQueryParams.parse(query)
      : undefined;

    if (!parsedParam) throw new Error("Missing Params");

    return this.request(
      {
        method: "GET",
        url:
          "/projects/" +
          parsedParam.project_id +
          "/devlogs" +
          (parsedQuery?.page ? "?page=" + parsedQuery.page : "")
      },
      ZTypes.ListProjectDevlogsResponse,
    );
  }

  devlog(param: unknown) {
    const parsedParam = param ? ZTypes.GetDevlogParams.parse(param) : undefined;

    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/devlogs/" + parsedParam.id,
      },
      ZTypes.GetDevlogResponse,
    );
  }

  users(query?: unknown) {
    const parsedQuery = query
      ? ZTypes.ListUsersQueryParams.parse(query)
      : undefined;

    const params = new URLSearchParams();

    if (parsedQuery?.query) {
      params.append("query", parsedQuery.query);
    }

    if (parsedQuery?.page) {
      params.append("page", String(parsedQuery.page));
    }

    return this.request(
      {
        method: "GET",
        url: "/users" + (params.toString() ? `?${params.toString()}` : ""),
      },
      ZTypes.ListUsersResponse,
    );
  }

  user(param: unknown) {
    const parsedParam = param ? ZTypes.GetUserParams.parse(param) : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/users/" + parsedParam.id,
      },
      ZTypes.GetUserResponse,
    );
  }

  shop() {
    return this.request(
      {
        method: "GET",
        url: "/store",
      },
      ZTypes.ListStoreItemsResponse,
    );
  }

  item(param: unknown) {
    const parsedParam = param
      ? ZTypes.GetStoreItemParams.parse(param)
      : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/store/" + parsedParam.id,
      },
      ZTypes.GetStoreItemResponse,
    );
  }
}
