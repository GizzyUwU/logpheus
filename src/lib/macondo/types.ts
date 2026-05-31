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
    image: zod.url().nullable(),
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
    cursor: zod.coerce.number().int().positive().optional()
  });

  export const ShopModifierOption = zod.object({
    id: zod.string(),
    label: zod.string(),
    price_delta_hours: zod.number(),
  });

  export const ShopModifier = zod.object({
    id: zod.string(),
    type: zod.string(),
    label: zod.string(),
    options: zod.array(ShopModifierOption),
    required: zod.boolean(),
  });

  export const ShopRegionalPricing = zod.record(
    zod.string(),
    zod.object({
      available: zod.boolean().optional(),
      store_url: zod.url().nullable().optional(),
      price_hours: zod.number().optional(),
    }),
  );

  export const ShopItemParams = zod.object({
    itemId: zod.coerce.number().int().nonnegative().min(1),
  })

  export const ShopItem = zod.object({
    id: zod.number().int(),
    slug: zod.string().nullable(),
    name: zod.string(),
    description: zod.string().nullable(),
    name_translations: zod.record(zod.string(), zod.string()).nullable(),
    description_translations: zod.record(zod.string(), zod.string()).nullable(),
    price_hours: zod.number(),
    price_fruit_type: zod.unknown().nullable(),
    price_fruit_amount: zod.unknown().nullable(),
    price_fruit_level: zod.unknown().nullable(),
    price_fruit_category: zod.unknown().nullable(),
    image_url: zod.url().nullable(),
    kind: zod.string(),
    fulfillment_provider: zod.string(),
    source: zod.string().nullable(),
    grant_amount_cents: zod.number().int().nullable(),
    attachment_urls: zod.array(zod.string()),
    inventory_mode: zod.string(),
    stock_remaining: zod.number().int().nullable(),
    max_per_user: zod.number().int().nullable(),
    sale_ends_at: zod.string().nullable(),
    available: zod.boolean(),
    coming_soon: zod.boolean(),
    requires_shipped_project: zod.boolean(),
    pinned: zod.boolean(),
    extra_fruity: zod.boolean(),
    regional_pricing: ShopRegionalPricing.nullable(),
    modifiers: zod.array(ShopModifier).nullable(),
    created_at: zod.string(),
    updated_at: zod.string(),
    price_gold: zod.number().int(),
    is_expired: zod.boolean(),
    is_sold_out: zod.boolean(),
    is_purchasable: zod.boolean(),
    available_in_region: zod.boolean(),
    resolved_region: zod.string(),
    user_has_unlocked: zod.boolean(),
    user_purchased_count: zod.number().int(),
    hit_per_user_cap: zod.boolean(),
    blocked_no_shipped_project: zod.boolean(),
    is_locked: zod.boolean(),
    max_quantity_per_order: zod.number().int().nullable(),
    starred: zod.boolean(),
  });

  export const ShopItemsResponse = zod.object({
    items: zod.array(ShopItem),
    region: zod.string(),
    user_has_shipped_project: zod.boolean().nullable(),
    under_renovation: zod.boolean(),
  });

  export const UserBalanceResponse = zod.object({
    balance: zod.number(),
  });

  export const ProjectOwner = zod.object({
    id: zod.uuidv4(),
    image: zod.url().nullable(),
    username: zod.string(),
    slack_id: zod.string(),
  });

  export const ProjectJournalAuthor = zod.object({
    id: zod.uuidv4(),
    image: zod.url().nullable(),
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
    author_image: zod.url().nullable(),
  });

  export const ProjectParams = zod.object({
    id: zod.coerce.number().int().nonnegative().min(1),
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
    demo_url: zod.url().nullable().nullish(),
    thumbnail_url: zod.url().nullable().nullish(),
    repository_url: zod.url().nullable().nullish(),
    hackatime_projects: zod.array(zod.string()),
    is_fork: zod.boolean(),
    guide: zod.string().nullish(),
    html_content: zod.string().nullish(),
    css_content: zod.string().nullish(),
    readme_content: zod.string().nullish(),
    last_html_sha: zod.string().nullish(),
    last_css_sha: zod.string().nullish(),
    invite_code: zod.string().nullish(),
    project_streak_days: zod.number().int(),
    last_worked_date: zod.string().nullable,
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
    image: zod.url().nullable(),
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
    thumbnail_url: zod.url().nullable().nullish(),
    project_streak_days: zod.number().int(),
    last_worked_date: zod.string().nullable(),
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
    cursor: zod.coerce.number().int().positive().optional(),
    search: zod.string().optional()
  });

  export const ExplorePeopleItem = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url().nullable(),
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
    cursor: zod.coerce.number().int().positive().optional(),
    search: zod.string().optional()
  });

  export const UserParams = zod.object({
    userId: zod.uuidv4(),
  });

  export const UserResponse = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url().nullable(),
    slack_id: zod.string(),
    created_at: zod.string(),
    last_active_date: zod.string(),
    project_count: zod.number().int(),
    total_upvotes: zod.number().int(),
    top_streak_days: zod.number().int(),
    projects: zod.array(UserProject),
  });

  export const HackatimeProject = zod.object({
    name: zod.string(),
    total_seconds: zod.coerce.number().int().nonnegative(),
    total_seconds_in_window: zod.coerce.number().int().nonnegative(),
  });

  export const HackatimeProjectsResponse = zod.object({
    projects: zod.array(HackatimeProject),
  });

  export const HackatimeProjectsQuerys = zod.object({
    since: zod.iso.date().optional(),
  });

  export const HackatimeProjectsParams = zod.object({
    name: zod.string()
  });

  export const HackatimeBreakdownItem = zod.object({
    name: zod.string(),
    hours: zod.number(),
  });

  export const HackatimeContributor = zod.object({
    user_id: zod.uuidv4(),
    username: zod.string(),
    slack_id: zod.string(),
    image: zod.url().nullable(),
    is_owner: zod.boolean(),
    is_self: zod.boolean(),
    projects: zod.array(HackatimeBreakdownItem).optional(),
  });

  export const HackatimeBreakdownResponse = zod.object({
    hackatimeBreakdown: zod.array(HackatimeBreakdownItem),
    contributors: zod.array(HackatimeContributor).optional(),
  });

  export const HackatimeBreakdownParams = zod.object({
    projectId: zod.coerce.number().int().min(1),
  });
}