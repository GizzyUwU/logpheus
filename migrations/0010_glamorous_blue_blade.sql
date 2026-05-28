ALTER TABLE "projects" ALTER COLUMN "multiplier" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "ysws" ADD COLUMN "goals" integer[];--> statement-breakpoint
ALTER TABLE "ysws" ADD COLUMN "avg_mult" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_apiKey_unique" UNIQUE("api_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_userId_unique" UNIQUE("user_id");