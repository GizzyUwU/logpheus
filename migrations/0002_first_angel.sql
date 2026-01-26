ALTER TABLE "users" ALTER COLUMN "channel" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "projects" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "disabled" SET DEFAULT false;