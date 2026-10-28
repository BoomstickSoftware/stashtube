CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"query" jsonb NOT NULL,
	"from_scene" text,
	"mode" text DEFAULT 'full' NOT NULL,
	"window" integer DEFAULT 60 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
