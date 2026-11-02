CREATE TABLE "get_queue" (
	"stashdb_id" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "sdb_entities" (
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"disambiguation" text,
	"image" text,
	"parent_id" text,
	"parent_name" text,
	"scene_count" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sdb_entities_kind_id_pk" PRIMARY KEY("kind","id")
);
--> statement-breakpoint
CREATE TABLE "sdb_queries" (
	"key" text PRIMARY KEY NOT NULL,
	"ids" text[] NOT NULL,
	"count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdb_scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"date" text,
	"duration" integer,
	"studio_id" text,
	"studio_name" text,
	"performers" jsonb NOT NULL,
	"performer_ids" text[] NOT NULL,
	"tags" jsonb NOT NULL,
	"tag_ids" text[] NOT NULL,
	"image" text,
	"code" text,
	"created" text,
	"updated" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdb_scopes" (
	"key" text PRIMARY KEY NOT NULL,
	"total" integer,
	"complete" boolean DEFAULT false NOT NULL,
	"newest_updated" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "whisparr_gets" ADD COLUMN "searched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sdb_scenes_studio" ON "sdb_scenes" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "sdb_scenes_date" ON "sdb_scenes" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sdb_scenes_performers" ON "sdb_scenes" USING gin ("performer_ids");--> statement-breakpoint
CREATE INDEX "sdb_scenes_tags" ON "sdb_scenes" USING gin ("tag_ids");