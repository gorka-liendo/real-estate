CREATE TYPE "public"."expense_category" AS ENUM('water', 'electricity', 'gas', 'community', 'taxes', 'derrama', 'maintenance', 'insurance', 'other');--> statement-breakpoint
CREATE TABLE "property_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"concept" text,
	"amount_cents" integer NOT NULL,
	"expense_date" date NOT NULL,
	"file_url" text,
	"file_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_expenses" ADD CONSTRAINT "property_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_expenses" ADD CONSTRAINT "property_expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;