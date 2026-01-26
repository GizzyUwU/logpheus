import axios, { type AxiosInstance } from "axios";
import type * as FTypes from "./ft.d";

export default class FT {
    lastCode: number | null = null;
    private apiToken: string;
    private fetch: AxiosInstance;
    private ready: Promise<void>;

    constructor(apiToken: string) {
        if (apiToken.length === 0) throw new Error("Flavortown API Key is required")
        this.apiToken = apiToken;
        this.fetch = axios.create({
            baseURL: "https://flavortown.hackclub.com/api/v1",
            headers: {
                Authorization: `Bearer ${this.apiToken}`,
                "X-Flavortown-Ext-1865": true
            },
        })
        this.ready = Promise.resolve();
    }

    private async handleError(err: unknown, projectId?: string): Promise<void> {
        if (axios.isAxiosError(err)) {
            this.lastCode =
                err?.response?.status ??
                err?.status ??
                null;

            return;
        } else {
            console.error("Unexpected error:", err);
            return
        }
    }

    async projects(query?: FTypes.ProjectsQuery): Promise<FTypes.Projects | void> {
        await this.ready;
        const queryString = new URLSearchParams();
        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryString.append(key, String(value));
                }
            });
        }

        return this.fetch.get("/projects" + String(queryString))
            .then((res) => {
                this.lastCode = res.status;
                return res.data;
            })
            .catch((err) => {
                this.handleError(err);
            });
    }

    async project(param: FTypes.ProjectParam): Promise<FTypes.Project | void> {
        await this.ready;
        return this.fetch.get("/projects/" + param.id)
            .then((res) => {
                this.lastCode = res.status;
                return res.data;
            })
            .catch((err) => {
                this.handleError(err, String(param.id));
            });
    }

    async devlogs(param: FTypes.ProjectParam, query?: FTypes.DevlogsQuery): Promise<FTypes.Devlogs | void> {
        await this.ready;
        const queryString = new URLSearchParams();
        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryString.append(key, String(value));
                }
            });
        }

        return this.fetch.get("/projects/" + param.id + "/devlogs" + String(queryString))
            .then((res) => {
                this.lastCode = res.status;
                return res.data;
            })
            .catch((err) => {
                this.handleError(err, String(param.id));
                return err;
            });
    }

    async devlog(param: FTypes.DevlogParam, query?: FTypes.DevlogsQuery): Promise<FTypes.Devlog | void> {
        await this.ready;
        return this.fetch.get("/projects/" + param.projectId + "/devlogs/" + param.devlogId)
            .then((res) => {
                this.lastCode = res.status;
                return res.data;
            })
            .catch((err) => {
                this.handleError(err, String(param.projectId));
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

        return this.fetch.get("/users?" + String(queryString))
            .then((res) => {
                this.lastCode = res.status;
                return res.data;
            })
            .catch((err) => {
                this.handleError(err, String(queryString));
            });
    }


    async user(param: FTypes.UserParams): Promise<FTypes.User | void> {
        await this.ready;
        return this.fetch.get("/users/" + param.id)
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