CREATE TABLE "whisparr_gets" (
	"movie_id" integer PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whisparr_watch" (
	"kind" text NOT NULL,
	"foreign_id" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whisparr_watch_kind_foreign_id_pk" PRIMARY KEY("kind","foreign_id")
);
