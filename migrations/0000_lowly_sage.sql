CREATE TABLE "projects" (
	"id" integer PRIMARY KEY NOT NULL,
	"devlog_ids" integer[] NOT NULL,
	"devlog_created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"api_key" varchar PRIMARY KEY NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"projects" integer[] NOT NULL,
	"disabled" boolean,
	CONSTRAINT "users_channel_unique" UNIQUE("channel")
);
