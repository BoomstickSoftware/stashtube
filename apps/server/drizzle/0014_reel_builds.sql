CREATE TABLE "reel_builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"reel_id" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"now" boolean DEFAULT false NOT NULL,
	"plan_hash" text NOT NULL,
	"plan" jsonb NOT NULL,
	"progress" double precision DEFAULT 0 NOT NULL,
	"message" text,
	"error" text,
	"file" text,
	"duration_sec" double precision,
	"size_bytes" double precision,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reel_builds" ADD CONSTRAINT "reel_builds_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reel_builds_reel" ON "reel_builds" USING btree ("reel_id");--> statement-breakpoint
CREATE INDEX "reel_builds_status" ON "reel_builds" USING btree ("status");