import * as ZTypes from "./bs.zod";
import { z } from "zod";

export interface BugsinkConfig {
  baseUrl: string;
  apiToken: string;
}

export class BugsinkClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: BugsinkConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiToken = config.apiToken;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/canonical/0${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bugsink API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async listProjects(): Promise<z.infer<typeof ZTypes.ProjectsListResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ProjectsListResponse>>('/projects/');
  }

  async getProject(data: z.infer<typeof ZTypes.ProjectsRetrieveParams>): Promise<z.infer<typeof ZTypes.ProjectsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ProjectsRetrieveResponse>>(`/projects/${data.id}/`);
  }

  async listTeams(): Promise<z.infer<typeof ZTypes.TeamsListResponse>> {
    return this.fetch<z.infer<typeof ZTypes.TeamsListResponse>>('/teams/');
  }

  async listIssues(options: z.infer<typeof ZTypes.IssuesListQueryParams>): Promise<z.infer<typeof ZTypes.IssuesListResponse>> {
    const params = new URLSearchParams();
    params.set('project', options.project.toString());

    if (options?.sort) {
      params.set('sort', options.sort);
    }
    if (options?.order) {
      params.set('order', options.order);
    }

    return this.fetch<z.infer<typeof ZTypes.IssuesListResponse>>(`/issues/?${params.toString()}`);
  }

  async getIssue(data: z.infer<typeof ZTypes.IssuesRetrieveParams>): Promise<z.infer<typeof ZTypes.IssuesRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.IssuesRetrieveResponse>>(`/issues/${data.id}/`);
  }

  async listEvents(options: z.infer<typeof ZTypes.EventsListQueryParams>): Promise<z.infer<typeof ZTypes.EventsListResponse>> {
    const params = new URLSearchParams();
    params.set('issue', options.issue);

    if (options?.order) {
      params.set('order', options.order.toString());
    }
    
    if (options?.cursor) {
      params.set('cursor', options.cursor.toString());
    }

    return this.fetch<z.infer<typeof ZTypes.EventsListResponse>>(`/events/?${params.toString()}`);
  }

  async getEvent(data: z.infer<typeof ZTypes.EventsRetrieveParams>): Promise<z.infer<typeof ZTypes.EventsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.EventsRetrieveResponse>>(`/events/${data.id}/`);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const projects = await this.listProjects();
      return {
        success: true,
        message: `Connected successfully. Found ${projects.results.length} project(s).`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createProject(body: z.infer<typeof ZTypes.ProjectsCreateBody>): Promise<z.infer<typeof ZTypes.ProjectsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ProjectsRetrieveResponse>>('/projects/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateProject(data: z.infer<typeof ZTypes.ProjectsPartialUpdateParams>, body: z.infer<typeof ZTypes.ProjectsPartialUpdateBody>): Promise<z.infer<typeof ZTypes.ProjectsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ProjectsRetrieveResponse>>(`/projects/${data.id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async getTeam(data: z.infer<typeof ZTypes.TeamsRetrieveParams>): Promise<z.infer<typeof ZTypes.TeamsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.TeamsRetrieveResponse>>(`/teams/${data.id}/`);
  }

  async createTeam(data: z.infer<typeof ZTypes.TeamsCreateBody>): Promise<z.infer<typeof ZTypes.TeamsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.TeamsRetrieveResponse>>('/teams/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeam(data: z.infer<typeof ZTypes.TeamsPartialUpdateParams>, body: z.infer<typeof ZTypes.TeamsPartialUpdateBody>): Promise<z.infer<typeof ZTypes.TeamsRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.TeamsRetrieveResponse>>(`/teams/${data.id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async getEventStacktrace(data: z.infer<typeof ZTypes.EventsStacktraceRetrieveParams>): Promise<string> {
    const url = `${this.baseUrl}/api/canonical/0/events/${data.id}/stacktrace/`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bugsink API error (${response.status}): ${errorText}`);
    }

    return response.text();
  }

  async listReleases(data: z.infer<typeof ZTypes.ReleasesListQueryParams>): Promise<z.infer<typeof ZTypes.ReleasesListResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ReleasesListResponse>>(`/releases/?project=${data.project}`);
  }

  async getRelease(data: z.infer<typeof ZTypes.ReleasesRetrieveParams>): Promise<z.infer<typeof ZTypes.ReleasesRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ReleasesRetrieveResponse>>(`/releases/${data.id}/`);
  }

  async createRelease(data: z.infer<typeof ZTypes.ReleasesCreateBody>): Promise<z.infer<typeof ZTypes.ReleasesRetrieveResponse>> {
    return this.fetch<z.infer<typeof ZTypes.ReleasesRetrieveResponse>>('/releases/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}