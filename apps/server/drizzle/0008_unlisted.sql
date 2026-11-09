CREATE TABLE "unlisted" (
	"kind" text NOT NULL,
	"stash_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unlisted_kind_stash_id_pk" PRIMARY KEY("kind","stash_id")
);
--> statement-breakpoint
-- the Edu categories become Unlisted categories (wiki features/vault)
INSERT INTO "unlisted" ("kind", "stash_id", "name", "created_at") SELECT 'tag', "stash_id", "name", "created_at" FROM "edu_tags" ON CONFLICT DO NOTHING;
