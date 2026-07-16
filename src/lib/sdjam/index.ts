import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";
import type { logger as LogType } from "@/index.ts";
import { ZTypes } from "./types";
import { z } from "zod";

export default class SDJam {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(logtape: typeof LogType) {
    this.fetch = axios.create({
      baseURL: "https://stardance.jam06452.uk/api/v2",
      timeout: 10000,
      // ...(apiKey && apiKey.length > 0 ? {
      //   headers: {
      //     Authorization: `Bearer ${apiKey}`
      //   }
      // } : {})
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
         console.log("FAILING URL:", err.config?.url, err.config?.params);
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

  projects(query?: z.infer<typeof ZTypes.ListProjectsV2QueryParams>) {
    return this.request(
      {
        method: "GET",
        url: "/projects",
        params: query
      },
      ZTypes.ListProjectsV2Response,
    );
  }

  project(param: z.infer<typeof ZTypes.GetProjectV2Params>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + param.id,
      },
      ZTypes.GetProjectV2Response,
    );
  }

  devlogs(param: z.infer<typeof ZTypes.ListProjectDevlogsV2Params>, query?: z.infer<typeof ZTypes.ListProjectDevlogsV2QueryParams>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + param.id,
        params: query
      },
      ZTypes.ListProjectDevlogsV2Response,
    );
  }

  async devlog(param: z.infer<typeof ZTypes.GetProjectDevlogV2Params>) {
    return this.request(
      {
        method: "GET",
        url: "/projects/" + param.id + "/" + param.devlog_id,
      },
      ZTypes.GetProjectDevlogV2Response,
    );
  }

  users(query?: z.infer<typeof ZTypes.ListUsersV2QueryParams>) {
    return this.request(
      {
        method: "GET",
        url: "/users",
        params: query
      },
      ZTypes.ListUsersV2Response,
    );
  }

  user(param: z.infer<typeof ZTypes.GetUserV2Params>) {
    return this.request(
      {
        method: "GET",
        url: "/users/" + param.username,
      },
      ZTypes.GetUserV2Response,
    );
  }

  userProjects(param: z.infer<typeof ZTypes.ListUserProjectsV2Params>, query?: z.infer<typeof ZTypes.ListUserProjectsV2QueryParams>) {
    return this.request(
      {
        method: "GET",
        url: "/users/" + param.username + "/projects",
        params: query
      },
      ZTypes.ListUserProjectsV2Response,
    );
  }
}
