import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";
import type { logger as LogType } from "@/index.ts";
import { ZTypes } from "./types";
import { z } from "zod";

export default class Theseus {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(apiKey: string, logtape: typeof LogType) {
    this.fetch = axios.create({
      baseURL: "https://mail.hackclub.com/api/public/v1",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
      timeout: 10000,
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

  me() {
    return this.request(
      {
        method: "GET",
        url: "/me",
      },
      ZTypes.GetMeResponse,
    );
  }

  mail() {
    return this.request(
      {
        method: "GET",
        url: "/mail",
      },
      ZTypes.ListMailResponse,
    );
  }

  letters() {
    return this.request(
      {
        method: "GET",
        url: "/letters",
      },
      ZTypes.ListLettersResponse,
    );
  }

  letter(params: z.infer<typeof ZTypes.GetLetterParams>) {
    const parsedParam = params ? ZTypes.GetLetterParams.parse(params) : undefined;
    if (!parsedParam) throw new Error("Missing Params");

    return this.request(
      {
        method: "GET",
        url: "/letters/" + parsedParam.id,
      },
      ZTypes.GetLetterResponse,
    );
  }

  packages() {
    return this.request(
      {
        method: "GET",
        url: "/packages",
      },
      ZTypes.ListPackagesResponse,
    );
  }

  async package(params: z.infer<typeof ZTypes.GetPackageParams>) {
    const parsedParam = params ? ZTypes.GetPackageParams.parse(params) : undefined;
    if (!parsedParam) throw new Error("Missing Params");
    const packagesApi = await this.packages();
    if (!packagesApi.ok) return packagesApi;

    const packageItem = packagesApi.data.packages.find(
      (entry) => entry.id === parsedParam.id,
    );

    if (!packageItem) {
      return {
        ok: false as const,
        status: 404,
        msg: "Journal not found",
      };
    }

    return {
      ok: packagesApi.ok,
      status: packagesApi.status,
      data: packageItem,
    };
  }
}
