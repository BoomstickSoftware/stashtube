CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "kind" text;--> statement-breakpoint
CREATE UNIQUE INDEX "playlists_kind_unique" ON "playlists" USING btree ("kind");