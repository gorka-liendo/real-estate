CREATE TYPE "public"."property_kind" AS ENUM('flat', 'house', 'commercial', 'land', 'garage');--> statement-breakpoint
CREATE TYPE "public"."property_operation" AS ENUM('sale', 'rent');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"operation" "property_operation" DEFAULT 'sale' NOT NULL,
	"kind" "property_kind" DEFAULT 'flat' NOT NULL,
	"status" "property_status" DEFAULT 'draft' NOT NULL,
	"price" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"area_m2" integer,
	"city" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;