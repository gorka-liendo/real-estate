CREATE TABLE "property_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"area_m2" integer,
	"ref_price" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "property_rooms" ADD CONSTRAINT "property_rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_rooms" ADD CONSTRAINT "property_rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_room_id_property_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."property_rooms"("id") ON DELETE set null ON UPDATE no action;