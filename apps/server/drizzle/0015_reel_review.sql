CREATE TABLE "reel_refs" (
	"reel_id" integer NOT NULL,
	"kind" text NOT NULL,
	"stash_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "reel_refs_reel_id_kind_stash_id_pk" PRIMARY KEY("reel_id","kind","stash_id")
);
--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "published_build_id" integer;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "rating" double precision;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "resume_sec" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "play_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reels" ADD COLUMN "last_played_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reel_refs" ADD CONSTRAINT "reel_refs_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "public"."reels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reel_refs_ref" ON "reel_refs" USING btree ("kind","stash_id");