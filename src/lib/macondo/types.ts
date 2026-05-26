import * as zod from "zod";

export namespace ZTypes {
  export const LeaderboardType = zod.enum([
    "upvotes",
    "hours",
    "ships",
    "gold",
    "referrals",
  ]);

  export const LeaderboardItem = zod.object({
    rank: zod.number().int().min(1),
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url(),
    slack_id: zod.string(),
    created_at: zod.string(),
    metric: zod.number(),
    project_count: zod.number().int().nonnegative(),
  });

  export const LeaderboardResponse = zod.object({
    type: LeaderboardType,
    items: zod.array(LeaderboardItem),
  });

  export const LeaderboardQueryParams = zod.object({
    type: LeaderboardType.default("upvotes"),
    limit: zod.coerce.number().int().positive().optional(),
  });

  export const ProjectOwner = zod.object({
    id: zod.uuidv4(),
    image: zod.url(),
    username: zod.string(),
    slack_id: zod.string(),
  });

  export const ProjectJournalAuthor = zod.object({
    id: zod.uuidv4(),
    image: zod.url(),
    username: zod.string(),
    slack_id: zod.string(),
    created_at: zod.string(),
  });

  export const ProjectJournal = zod.object({
    id: zod.number().int(),
    short_brief: zod.string(),
    long_brief: zod.string(),
    hours: zod.number(),
    created_at: zod.string(),
    archived: zod.boolean(),
    archived_at: zod.string().nullable(),
    content_language: zod.string(),
    author_id: zod.uuidv4(),
    author_username: zod.string(),
    author_slack_id: zod.string(),
    author_image: zod.url(),
  });

  export const ProjectParams = zod.object({
    id: zod.coerce.number().int().min(1),
  });

  export const ProjectResponse = zod.object({
    id: zod.number().int(),
    user_id: zod.uuidv4(),
    name: zod.string(),
    type: zod.string(),
    description: zod.string(),
    fruit: zod.string(),
    level: zod.string(),
    stage: zod.number().int(),
    demo_url: zod.string().url().nullish(),
    thumbnail_url: zod.string().url().nullish(),
    repository_url: zod.string().url().nullish(),
    hackatime_projects: zod.array(zod.string()),
    is_fork: zod.boolean(),
    guide: zod.string().nullish(),
    html_content: zod.string().nullish(),
    css_content: zod.string().nullish(),
    readme_content: zod.string().nullish(),
    last_html_sha: zod.string().nullish(),
    last_css_sha: zod.string().nullish(),
    invite_code: zod.string(),
    project_streak_days: zod.number().int(),
    last_worked_date: zod.string(),
    auto_use_streak_freezes: zod.boolean(),
    cart_screenshots: zod.array(zod.unknown()).nullish(),
    build_cost_cents: zod.number().int().nullish(),
    next_ship_needs_funding: zod.boolean(),
    next_ship_used_ai: zod.boolean(),
    next_ship_ai_usage_description: zod.string().nullish(),
    next_ship_is_update: zod.boolean(),
    next_ship_update_description: zod.string().nullish(),
    created_at: zod.string(),
    updated_at: zod.string(),
    owner: ProjectOwner,
    journals: zod.array(ProjectJournal),
    viewer_is_owner: zod.boolean(),
    viewer_can_edit: zod.boolean(),
    activeShip: zod.unknown().nullish(),
    needsChangesShip: zod.unknown().nullish(),
    latestActiveGrant: zod.unknown().nullish(),
    has_active_grant: zod.boolean(),
    hasPreviousShippedShip: zod.boolean(),
    is_extra_fruity: zod.boolean(),
    pendingFruit: zod.unknown().nullish(),
    previousShippedHackatimeHours: zod.number().nullish(),
    unshippedJournalHours: zod.number().nullish(),
    streakStatus: zod.string(),
  });

  export const ProjectJournalsResponse = ProjectResponse.transform(
    (project) => project.journals,
  );

  export const ProjectJournalParams = zod.object({
    projectId: zod.coerce.number().int().min(1),
    journalId: zod.coerce.number().int().min(1),
  });

  export const UserProjectOwner = zod.object({
    id: zod.uuidv4(),
    image: zod.url(),
    username: zod.string(),
    slack_id: zod.string(),
    created_at: zod.string(),
  });

  export const UserProject = zod.object({
    id: zod.number().int(),
    name: zod.string(),
    description: zod.string(),
    type: zod.string(),
    fruit: zod.string(),
    level: zod.string(),
    thumbnail_url: zod.string().url().nullish(),
    project_streak_days: zod.number().int(),
    last_worked_date: zod.string(),
    created_at: zod.string(),
    updated_at: zod.string(),
    upvote_count: zod.number().int(),
    current_user_upvoted: zod.boolean(),
    has_shipped: zod.boolean(),
    owner: UserProjectOwner,
  });

  export const ExploreProjectsResponse = zod.object({
    items: zod.array(UserProject),
  });

  export const ExploreProjectsQueryParams = zod.object({
    sort: zod.enum(["recently_active", "newest", "popularity", "streak"]).optional(),
    level: zod.coerce.number().int().min(1).max(4).optional(),
    fruit: zod.enum([
      "Mango",
      "Guava",
      "Pineapple",
      "Coconut",
      "Papaya",
      "Watermelon",
      "Cocoa",
      "Avocado",
    ]).optional(),
    type: zod.enum(["software", "hardware"]).optional(),
    status: zod.enum(["shipped", "in_progress"]).optional(),
    limit: zod.coerce.number().int().min(1).positive().optional(),
  });

  export const ExplorePeopleItem = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url(),
    slack_id: zod.string(),
    last_active_date: zod.string(),
    created_at: zod.string(),
    project_count: zod.number().int(),
    total_upvotes: zod.number().int(),
    top_streak_days: zod.number().int(),
  });

  export const ExplorePeopleResponse = zod.object({
    items: zod.array(ExplorePeopleItem),
  });

  export const ExplorePeopleQueryParams = zod.object({
    sort: zod.enum(["recently_active", "newest", "popularity", "streak"]).optional(),
    limit: zod.coerce.number().int().min(1).positive().optional(),
  });

  export const UserParams = zod.object({
    userId: zod.uuidv4(),
  });

  export const UserResponse = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url(),
    slack_id: zod.string(),
    created_at: zod.string(),
    last_active_date: zod.string(),
    project_count: zod.number().int(),
    total_upvotes: zod.number().int(),
    top_streak_days: zod.number().int(),
    projects: zod.array(UserProject),
  });
}