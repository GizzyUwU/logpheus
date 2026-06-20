ALTER TABLE "shop" ALTER COLUMN "base_hours" SET DATA TYPE numeric(30, 10);--> statement-breakpoint
ALTER TABLE "shop" ALTER COLUMN "base_hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shop" ALTER COLUMN "base_cost" SET DATA TYPE numeric(30, 10);