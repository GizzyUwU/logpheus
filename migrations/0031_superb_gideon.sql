ALTER TABLE "ysws" ADD COLUMN "registered_jobs" text[];--> statement-breakpoint
ALTER TABLE "mcShopSuggestions" ADD COLUMN "downvote_count" integer;--> statement-breakpoint
CREATE INDEX "users_registered_jobs_idx" ON "ysws" USING gin ("registered_jobs");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ysws";