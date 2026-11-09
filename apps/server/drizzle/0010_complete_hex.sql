CREATE TABLE "cast_overrides" (
	"scene_id" text PRIMARY KEY NOT NULL,
	"women" integer NOT NULL,
	"men" integer NOT NULL,
	"other" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
