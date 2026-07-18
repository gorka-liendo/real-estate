CREATE TYPE "public"."client_source" AS ENUM('manual', 'microsite');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "source" "client_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "interest_property_id" uuid;