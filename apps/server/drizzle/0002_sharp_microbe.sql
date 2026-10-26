CREATE TABLE "saved_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"query" jsonb NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
