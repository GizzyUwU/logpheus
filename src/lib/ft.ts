import axios, { type AxiosInstance } from "axios";
import type * as FTypes from "./ft.d";
import { logger } from "..";

export default class FT {
  lastCode: number | null = null;
  private apiToken: string;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof logger;

  constructor(apiToken: string, logtape: typeof logger) {
    if (apiToken.length === 0)
      throw new Error("Flavortown API Key is required");
    this.apiToken = apiToken;
    this.logger = logtape;
    this.fetch = axios.create({
      baseURL: "https://flavortown.hackclub.com/api/v1",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "X-Flavortown-Ext-1865": true,
      },
    });
    this.fetch.interceptors.request.use(
      (config) => {
        this.logger
          .with({
            method: config.method?.toUpperCase(),
            url: config.url,
            data: config.data,
          })
          .debug("Request");

        return config;
      },
      (error) => {
        this.logger.error("Request error", { error });
        return Promise.reject(error);
      },
    );

    this.fetch.interceptors.response.use(
      (response) => {
        logger
          .with({
            method: response.config.method?.toUpperCase(),
            url: response.config.url,
            status: response.status,
          })
          .debug("Response");

        return response;
      },
      (error) => {
        this.logger
          .with({
            method: error.config?.method?.toUpperCase(),
            url: error.config?.url,
            status: error.response?.status,
            data: error.response?.data,
          })
          .error("Bad response", { error });

        return Promise.reject(error);
      },
    );
    this.ready = Promise.resolve();
  }

  private async handleError(err: unknown, projectId?: string): Promise<void> {
    if (axios.isAxiosError(err)) {
      this.lastCode = err?.response?.status ?? err?.status ?? null;
      this.logger.error({
        error: err,
      });
      return;
    } else {
      console.error("Unexpected error:", err);
      return;
    }
  }

  async projects(
    query?: FTypes.ProjectsQuery,
  ): Promise<FTypes.Projects | void> {
    await this.ready;
    try {
      return this.fetch
        .get("/projects", { params: query ?? undefined })
        .then((res) => {
          this.lastCode = res.status;
          return res.data;
        })
        .catch(async (err) => {
          await this.handleError(err);
          return undefined;
        });
    } catch (err) {
      await this.handleError(err);
      return undefined;
    }
  }

  async project(param: FTypes.ProjectParam): Promise<FTypes.Project | void> {
    await this.ready;
    return this.fetch
      .get("/projects/" + Number(param.id))
      .then((res) => {
        this.lastCode = res.status;
        return res.data;
      })
      .catch(async (err) => {
        await this.handleError(err);
        return err;
      });
  }

  async devlogs(
    param: FTypes.ProjectParam,
    query?: FTypes.DevlogsQuery,
  ): Promise<FTypes.Devlogs | void> {
    await this.ready;
    const queryString = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          queryString.append(key, String(value));
        }
      });
    }

    return this.fetch
      .get("/projects/" + Number(param.id) + "/devlogs" + String(queryString))
      .then((res) => {
        this.lastCode = res.status;
        return res.data;
      })
      .catch(async (err) => {
        await this.handleError(err);
        return err;
      });
  }

  async devlog(param: FTypes.DevlogParam): Promise<FTypes.Devlog | void> {
    await this.ready;
    return this.fetch
      .get("/devlogs/" + param.devlogId)
      .then((res) => {
        this.lastCode = res.status;
        return res.data;
      })
      .catch(async (err) => {
        await this.handleError(err);
        return err;
      });
  }

  async users(query: FTypes.UsersQuery): Promise<FTypes.Users | void> {
    await this.ready;
    const queryString = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          queryString.append(key, String(value));
        }
      });
    }

    return this.fetch
      .get("/users?" + String(queryString))
      .then((res) => {
        this.lastCode = res.status;
        return res.data;
      })
      .catch(async (err) => {
        await this.handleError(err);
        return err;
      });
  }

  async user(param: FTypes.UserParams): Promise<FTypes.User | void> {
    await this.ready;
    return this.fetch
      .get("/users/" + Number(param.id))
      .then((res) => {
        this.lastCode = res.status;
        return res.data;
      })
      .catch(async (err) => {
        await this.handleError(err, String(param.id));
        return {} as FTypes.User;
      });
  }
}
