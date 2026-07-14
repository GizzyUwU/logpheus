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
    image: zod.url().nullish(),
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
    cursor: zod.coerce.number().int().positive().optional(),
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
      store_url: zod.url().nullish().optional(),
      price_hours: zod.number().optional(),
    }),
  );

  export const ShopItemParams = zod.object({
    itemId: zod.coerce.number().int().nonnegative().min(1),
  });

  export const ShopItem = zod.object({
    id: zod.number().int(),
    slug: zod.string().nullish(),
    name: zod.string(),
    description: zod.string().nullish(),
    name_translations: zod.record(zod.string(), zod.string()).nullish(),
    description_translations: zod.record(zod.string(), zod.string()).nullish(),
    price_hours: zod.number(),
    price_fruit_type: zod.unknown().nullish(),
    price_fruit_amount: zod.unknown().nullish(),
    price_fruit_level: zod.unknown().nullish(),
    price_fruit_category: zod.unknown().nullish(),
    image_url: zod.url().nullish(),
    kind: zod.string(),
    fulfillment_provider: zod.string(),
    source: zod.string().nullish(),
    grant_amount_cents: zod.number().int().nullish(),
    attachment_urls: zod.array(zod.string()),
    inventory_mode: zod.string(),
    stock_remaining: zod.number().int().nullish(),
    max_per_user: zod.number().int().nullish(),
    sale_ends_at: zod.string().nullish(),
    available: zod.boolean(),
    coming_soon: zod.boolean(),
    requires_shipped_project: zod.boolean(),
    pinned: zod.boolean(),
    extra_fruity: zod.boolean(),
    regional_pricing: ShopRegionalPricing.nullish(),
    modifiers: zod.array(ShopModifier).nullish(),
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
    max_quantity_per_order: zod.number().int().nullish(),
    starred: zod.boolean(),
  });

  export const ShopItemsResponse = zod.object({
    items: zod.array(ShopItem),
    region: zod.string(),
    user_has_shipped_project: zod.boolean().nullish(),
    under_renovation: zod.boolean(),
  });

  export const UserBalanceResponse = zod.object({
    balance: zod.number(),
  });

  export const ProjectOwner = zod.object({
    id: zod.uuidv4(),
    image: zod.url().nullish(),
    username: zod.string(),
    slack_id: zod.string(),
  });

  export const ProjectJournalAuthor = zod.object({
    id: zod.uuidv4(),
    image: zod.url().nullish(),
    username: zod.string(),
    slack_id: zod.string(),
    created_at: zod.string(),
  });

  export const ProjectJournal = zod.object({
    id: zod.number().int(),
    short_brief: zod.string().nullish(),
    long_brief: zod.string().nullish(),
    hours: zod.number().nullish(),
    created_at: zod.string().nullish(),
    archived: zod.boolean().nullish(),
    archived_at: zod.string().nullish(),
    content_language: zod.string().nullish(),
    author_id: zod.uuidv4(),
    author_username: zod.string().nullish(),
    author_slack_id: zod.string().nullish(),
    author_image: zod.url().nullish(),
  });

  export const ProjectParams = zod.object({
    id: zod.coerce.number().int().nonnegative().min(1),
  });

  export const ProjectResponse = zod.object({
    id: zod.number().int(),
    user_id: zod.uuidv4(),
    name: zod.string().nullish(),
    type: zod.string().nullish(),
    description: zod.string().nullish(),
    fruit: zod.string().nullish(),
    level: zod.string().nullish(),
    stage: zod.number().int().nullish(),
    demo_url: zod.url().nullish().nullish(),
    thumbnail_url: zod.url().nullish().nullish(),
    repository_url: zod.url().nullish().nullish(),
    hackatime_projects: zod.array(zod.string()).nullish(),
    is_fork: zod.boolean().nullish(),
    guide: zod.string().nullish(),
    html_content: zod.string().nullish(),
    css_content: zod.string().nullish(),
    readme_content: zod.string().nullish(),
    last_html_sha: zod.string().nullish(),
    last_css_sha: zod.string().nullish(),
    invite_code: zod.string().nullish(),
    project_streak_days: zod.number().int().nullish(),
    last_worked_date: zod.string().nullish(),
    auto_use_streak_freezes: zod.boolean().nullish(),
    cart_screenshots: zod.array(zod.unknown()).nullish(),
    build_cost_cents: zod.number().int().nullish(),
    next_ship_needs_funding: zod.boolean().nullish(),
    next_ship_used_ai: zod.boolean().nullish(),
    next_ship_ai_usage_description: zod.string().nullish(),
    next_ship_is_update: zod.boolean().nullish(),
    next_ship_update_description: zod.string().nullish(),
    created_at: zod.string().nullish(),
    updated_at: zod.string().nullish(),
    owner: ProjectOwner,
    journals: zod.array(ProjectJournal),
    viewer_is_owner: zod.boolean().nullish(),
    viewer_can_edit: zod.boolean().nullish(),
    activeShip: zod.unknown().nullish(),
    needsChangesShip: zod.unknown().nullish(),
    latestActiveGrant: zod.unknown().nullish(),
    has_active_grant: zod.boolean().nullish(),
    hasPreviousShippedShip: zod.boolean().nullish(),
    is_extra_fruity: zod.boolean().nullish(),
    pendingFruit: zod.unknown().nullish(),
    previousShippedHackatimeHours: zod.number().nullish(),
    unshippedJournalHours: zod.number().nullish(),
    streakStatus: zod.string().nullish(),
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
    image: zod.url().nullish(),
    username: zod.string(),
    slack_id: zod.string(),
    created_at: zod.string(),
  });

  export const UserProject = zod.object({
    id: zod.number().int(),
    name: zod.string().nullish(),
    description: zod.string().nullish(),
    type: zod.string().nullish(),
    fruit: zod.string().nullish(),
    level: zod.string().nullish(),
    thumbnail_url: zod.url().nullish().nullish(),
    project_streak_days: zod.number().int().nullish(),
    last_worked_date: zod.string().nullish(),
    created_at: zod.string().nullish(),
    updated_at: zod.string().nullish(),
    upvote_count: zod.number().int().nullish(),
    current_user_upvoted: zod.boolean().nullish(),
    has_shipped: zod.boolean().nullish(),
    owner: UserProjectOwner,
  });

  export const ExploreProjectsResponse = zod.object({
    items: zod.array(UserProject),
  });

  export const ExploreProjectsQueryParams = zod.object({
    sort: zod
      .enum(["recently_active", "newest", "popularity", "streak"])
      .optional(),
    level: zod.coerce.number().int().min(1).max(4).optional(),
    fruit: zod
      .enum([
        "Mango",
        "Guava",
        "Pineapple",
        "Coconut",
        "Papaya",
        "Watermelon",
        "Cocoa",
        "Avocado",
      ])
      .optional(),
    type: zod.enum(["software", "hardware"]).optional(),
    status: zod.enum(["shipped", "in_progress"]).optional(),
    limit: zod.coerce.number().int().min(1).positive().optional(),
    cursor: zod.coerce.number().int().positive().optional(),
    search: zod.string().optional(),
  });

  export const ExplorePeopleItem = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url().nullish(),
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
    sort: zod
      .enum(["recently_active", "newest", "popularity", "streak"])
      .optional(),
    limit: zod.coerce.number().int().min(1).positive().optional(),
    cursor: zod.coerce.number().int().positive().optional(),
    search: zod.string().optional(),
  });

  export const UserParams = zod.object({
    userId: zod.uuidv4(),
  });

  export const UserResponse = zod.object({
    id: zod.uuidv4(),
    username: zod.string(),
    image: zod.url().nullish(),
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

  export const HackatimeProjectsQueries = zod.object({
    since: zod.iso.date().optional(),
  });

  export const HackatimeProjectsParams = zod.object({
    name: zod.string(),
  });

  export const HackatimeBreakdownItem = zod.object({
    name: zod.string(),
    hours: zod.number(),
  });

  export const HackatimeContributor = zod.object({
    user_id: zod.uuidv4(),
    username: zod.string(),
    slack_id: zod.string(),
    image: zod.url().nullish(),
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

  export const ShopSuggestionQueries = zod.object({
    sort: zod.enum(["new", "top"]),
    page: zod.coerce.number().int().min(1).default(1),
    limit: zod.coerce.number().int().min(1).max(50).default(1),
  });

  export const ShopSuggestionItem = zod.object({
    id: zod.number(),
    name: zod.string(),
    description: zod.string().nullish(),
    store_url: zod.string().nullish(),
    image_url: zod.string().nullish(),
    cluster_id: zod.string().nullish(),
    group_tag: zod.string().nullish(),
    upvote_count: zod.number(),
    downvote_count: zod.number(),
    show_username: zod.boolean(),
    created_at: zod.iso.datetime(),
    submitter: zod
      .object({
        username: zod.string().nullish(),
        image: zod.string().nullish(),
      })
      .nullish(),
    voted: zod.boolean(),
    downvoted: zod.boolean(),
    can_delete: zod.boolean(),
  });

  export const ShopSuggestionResponse = zod.object({
    items: zod.array(ShopSuggestionItem),
    total: zod.number(),
    page: zod.number(),
    limit: zod.number(),
    viewer_signed_in: zod.boolean(),
    viewer_verified: zod.boolean(),
  });

  export const GetMeResponse = zod.object({
    id: zod.string(),
    name: zod.string(),
    email: zod.string(),
    image: zod.string(),
    created_at: zod.string(),
    username: zod.string(),
    slack_id: zod.string(),
    locale: zod.string(),
    timezone: zod.string(),
    onboarding_step: zod.string(),
    is_temp: zod.boolean(),
    has_hackclub: zod.boolean(),
    has_github: zod.boolean(),
    has_hackatime: zod.boolean(),
    hackatime_token_invalid: zod.boolean(),
    streak_freezes_remaining: zod.number(),
    worked_today: zod.boolean(),
    longest_current_streak: zod.number(),
    streak_slack_notifications: zod.boolean(),
    auto_use_streak_freezes: zod.boolean(),
    has_address: zod.boolean(),
    has_valid_address: zod.boolean(),
    has_valid_name: zod.boolean(),
    hca_verification_status: zod.string(),
    hca_ysws_eligible: zod.boolean(),
    last_login_at: zod.string(),
  });

  export const GetMyStreak = zod.object({
    current_streak: zod.number(),
    streak_freezes_remaining: zod.number(),
    worked_today: zod.boolean(),
    today_seconds_logged: zod.number().nullish(),
    daily_goal_seconds: zod.number(),
    projects: zod.array(
      zod.object({
        id: zod.number(),
        name: zod.string(),
        project_streak_days: zod.number().nullish(),
        last_worked_date: zod.string().nullish(),
        worked_today: zod.boolean(),
        auto_use_streak_freezes: zod.boolean(),
      }),
    ),
  });

  export const GetMyBalance = zod.object({
    balance: zod.number().nullish(),
  });

  export const GetMyNotificationsQueries = zod.object({
    page: zod.coerce.number().int().min(1).default(1),
    limit: zod.coerce.number().int().min(1).default(1),
  });

  export const GetMyNotificationsResponse = zod.object({
    items: zod.array(
      zod.object({
        id: zod.number(),
        user_id: zod.string(),
        type: zod.string(),
        title: zod.string(),
        body: zod.string().nullish(),
        action_url: zod.string().nullish(),
        entity_type: zod.string(),
        entity_id: zod.string(),
        read_at: zod.iso.datetime({ offset: true }).nullish(),
        created_at: zod.iso.datetime({ offset: true }),
      })),
    unread_count: zod.number(),
    next_cursor: zod.number()
  });

  export const GetMyEarnRate = zod.object({
    has_shipped: zod.boolean(),
    gold_per_hour: zod.number(),
    fruit_per_hour: zod.number(),
    total_gold: zod.number(),
    total_hours: zod.number(),
  });
}
