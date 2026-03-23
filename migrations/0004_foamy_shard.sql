ALTER TABLE "projects" ADD COLUMN "predicted_cookies" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "devlog_created_at";