CREATE TYPE "public"."rental_payment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."rental_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "rental_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"period" date NOT NULL,
	"amount" integer NOT NULL,
	"status" "rental_payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_payments_rental_period" UNIQUE("rental_id","period")
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"renter_client_id" uuid,
	"renter_name" text NOT NULL,
	"monthly_rent" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "rental_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_renter_client_id_clients_id_fk" FOREIGN KEY ("renter_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;