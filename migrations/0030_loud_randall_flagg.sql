CREATE TABLE "mcShopSuggestions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"store_url" text,
	"image_url" text,
	"group_tag" text,
	"upvote_count" integer,
	"show_username" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"submitter" text
);
