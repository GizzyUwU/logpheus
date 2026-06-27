DROP INDEX "users_active_hcb_idx";--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("user_id") WHERE "users"."disabled" = false;