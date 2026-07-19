CREATE TYPE "public"."client_kind" AS ENUM('owner', 'renter', 'buyer', 'seeker', 'other');--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kind" "client_kind" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "monthly_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;