--> statement-breakpoint
ALTER TABLE "hcb" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
CREATE INDEX "users_hcb_active_idx" ON "users" USING btree ("hcb_id") WHERE "users"."disabled" = false AND "users"."hcb_id" IS NOT NULL;