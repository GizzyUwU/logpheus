import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type * as FTypes from "./ft.d";
import type { logger as LogType } from "..";

export default class FT {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(apiKey: string, logtape: typeof LogType) {
    if (!apiKey) throw new Error("FT API Key is required");
    this.fetch = axios.create({
      baseURL: "https://flavortown.hackclub.com/api/v1",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Flavortown-Ext-1865": true,
      },
    });
    this.logger = logtape;
    this.ready = Promise.resolve();
  }

  private async request<T>(config: AxiosRequestConfig): Promise<
    | {
        ok: true;
        status: number;
        data: T;
      }
    | {
        ok: false;
        status: number | null;
        msg: string;
      }
  > {
    await this.ready;
    try {
      const res = await this.fetch.request<T>(config);
      this.lastCode = res.status;
      return { ok: true, status: res.status, data: res.data };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status ?? err.status ?? null;
        this.lastCode = status;
        return {
          ok: false,
          status,
          msg: err.message,
        };
      } else {
        this.logger.error("Unexpected Error occurred", {
          error: err,
        });
      }
      return {
        ok: false,
        status: null,
        msg: "Unexpected error occurred",
      };
    }
  }

  private get<T>(url: string, params?: unknown) {
    return this.request<T>({
      method: "GET",
      url,
      params,
    });
  }

  projects(query?: FTypes.ProjectsQuery) {
    return this.get<FTypes.Projects>("/projects", query);
  }

  project(param: FTypes.ProjectParam) {
    return this.get<FTypes.Project>("/projects/" + Number(param.id));
  }

  devlogs(param: FTypes.ProjectParam, query: FTypes.DevlogsQuery) {
    return this.get<FTypes.Devlogs>(
      "/projects/" + Number(param.id) + "/devlogs",
      query,
    );
  }

  devlog(param: FTypes.DevlogParam) {
    return this.get<FTypes.Devlog>("/devlogs/" + Number(param.devlogId));
  }

  users(query?: FTypes.UsersQuery) {
    return this.get<FTypes.Users>("/users", query);
  }

  user(param: FTypes.UserParams) {
    return this.get<FTypes.User>("/users/" + param.id);
  }

  shop() {
    return this.get<FTypes.Store>("/store");
  }

  item(param: FTypes.StoreItemParams) {
    return this.get<FTypes.StoreItem>("/store/" + Number(param.id));
  }
}
