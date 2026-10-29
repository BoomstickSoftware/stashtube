CREATE TABLE "station_resume" (
	"key" text PRIMARY KEY NOT NULL,
	"scene_id" text NOT NULL,
	"seconds" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
