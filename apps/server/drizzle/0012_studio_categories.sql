CREATE TABLE "studio_categories" (
	"studio_id" text NOT NULL,
	"studio_name" text NOT NULL,
	"tag_id" text NOT NULL,
	"tag_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_categories_studio_id_tag_id_pk" PRIMARY KEY("studio_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "studio_category_adds" (
	"scene_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_category_adds_scene_id_tag_id_pk" PRIMARY KEY("scene_id","tag_id")
);
