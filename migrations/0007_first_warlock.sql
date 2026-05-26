CREATE TABLE "ysws" (
	"ysws_id" integer PRIMARY KEY NOT NULL,
	"api_key" text,
	"user_id" text,
	"projects" integer[],
	"disabled" boolean DEFAULT false,
	"opt_outs" text[],
	"meta" text[]
);
--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'users'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "users" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "api_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ysws" integer[];