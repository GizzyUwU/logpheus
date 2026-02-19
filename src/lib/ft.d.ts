export type Devlog = {
  id: number;
  body: string;
  comments_count: number;
  duration_seconds: number;
  likes_count: number;
  scrapbook_url: string;
  created_at: string;
  updated_at: string;
  media: {
    url: string;
    content_type: string;
  }[];
};

export type DevlogParam = {
  projectId: string | number;
  devlogId: string | number;
};

export type Devlogs = {
  devlogs: Devlog[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    next_page: number | null;
  };
};

export type DevlogsQuery = {
  page?: number;
};

export type DevlogPatchNPut = {
  body: string;
  attachments?: FormData;
};

export type DevlogPost = {
  body: string;
  attachments: FormData;
};

export type ProjectPost = {
  title: string;
  description?: string;
  repo_url?: string;
  demo_url?: string;
  readme_url?: string;
  ai_declaration?: string;
};

export type ProjectPatch = {
  title?: string;
  description?: string;
  repo_url?: string;
  demo_url?: string;
  readme_url?: string;
  ai_declaration?: string;
};

export type Project = {
  id: number;
  title: string;
  description: string;
  repo_url: string;
  demo_url: string;
  readme_url: string;
  ai_declaration: string;
  ship_status: "draft" | "submitted";
  devlog_ids: number[];
  created_at: string;
  updated_at: string;
};

export type ProjectParam = {
  id: number | string;
};param

export type Projects = {
  projects: Project[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    next_page: number | null;
  };
};

export type ProjectsQuery = {
  page?: number;
  query?: string;
};

export type StoreItem = {
  id: number;
  name: string;
  description: string;
  old_prices: [];
  limited: boolean;
  stock: number;
  type: string;
  show_in_carousel: boolean;
  accessory_tag: string;
  agh_contents: any[];
  attached_shop_item_ids?: number[];
  buyable_by_self: boolean;
  long_description: string;
  max_qty: number;
  one_per_person_ever: boolean;
  sale_percentage: number;
  image_url: string;
  enabled: {
    enabled_au: boolean;
    enabled_ca: boolean;
    enabled_eu: boolean;
    enabled_in: boolean;
    enabled_uk: boolean;
    enabled_us: boolean;
    enabled_xx: boolean;
  };
  ticket_cost: {
    base_cost: number;
    au: number;
    ca: number;
    eu: number;
    in: number;
    uk: number;
    us: number;
    xx: number;
  };
};
export type Store = StoreItem[];

export type User = {
  id: number;
  slack_id: string;
  display_name: string;
  avatar: string;
  project_ids: number[];
  vote_count: number;
  like_count: number;
  devlog_seconds_total: number;
  devlog_seconds_today: number;
  cookies: number | null;
};

export type UserParams = {
  id: string | number | "me";
};

export type Users = {
  users: {
    id: number;
    slack_id: string;
    display_name: string;
    avatar: string;
    project_ids: number[];
    cookies: number | null;
  }[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_count: number;
    next_page: number | null;
  };
};

export type UsersQuery = {
  page?: number;
  query?: string;
};
