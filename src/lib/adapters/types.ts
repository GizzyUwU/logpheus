export interface CanonicalProject {
  id: number;
  title: string;
  devlogIds: number[];
}

export interface CanonicalDevlog {
  id: number;
  body: string | null;
  duration_seconds: number;
  created_at: string | null;
  media: { url: string; content_type: string }[];
}

export interface CanonicalUser {
  currency: number;
}

export interface CanonicalShopItem {
  id: number;
  name: string;
  baseCost: number;
  regionalCosts: Record<string, number>;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export interface PaginatedResult<T> {
  items: T[];
  next_page: number | null;
}

export interface ApiAdapter {
  readonly lastCode: number;
  readonly raw: unknown;
  readonly ready: Promise<void>;
  project(params: { id: number }): Promise<ApiResult<CanonicalProject>>;
  devlogs(
    params: { project_id: number },
    opts: { page: number },
  ): Promise<ApiResult<PaginatedResult<CanonicalDevlog>>>;
  user(params: { id: string }): Promise<ApiResult<CanonicalUser>>;
  shop(): Promise<ApiResult<CanonicalShopItem[]>>;
}
