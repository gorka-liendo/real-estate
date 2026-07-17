ALTER TABLE "properties" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;