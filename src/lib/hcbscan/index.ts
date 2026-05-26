import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";
import type { logger as LogType } from "@/index.ts";
import * as ZTypes from "./types";
import { z } from "zod";

export default class HCBScan {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(logtape: typeof LogType) {
    this.fetch = axios.create({
      baseURL: "https://hcbscan.3kh0.net/api/v1",
      timeout: 10000,
      headers: {
        "Cookie": "fuck_ofcom=yup;"
      }
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
            schemaDesc: schema.description,
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

  userActivities(
    param: z.infer<typeof ZTypes.GetUserActivitiesParams>,
    query?: z.infer<typeof ZTypes.GetUserActivitiesQueryParams>,
  ) {
    const parsedParam = param
      ? ZTypes.GetUserActivitiesParams.parse(param)
      : undefined;
    const parsedQuery = query
      ? ZTypes.GetUserActivitiesQueryParams.parse(query)
      : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    return this.request(
      {
        method: "GET",
        url: "/users/" + parsedParam.id + "/activities",
        params: parsedQuery,
      },
      ZTypes.GetUserActivitiesResponse,
    );
  }
}
