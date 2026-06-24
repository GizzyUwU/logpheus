CREATE TABLE "theseus" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"public_url" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"dispatched_at" timestamp,
	"mailed_at" timestamp,
	"carrier" text,
	"service" text,
	"tracking_number" text,
	"tracking_link" text,
	CONSTRAINT "theseus_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theseus_key" text;