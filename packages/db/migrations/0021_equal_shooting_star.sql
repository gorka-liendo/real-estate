ALTER TABLE "clients" ADD COLUMN "secondary_phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;