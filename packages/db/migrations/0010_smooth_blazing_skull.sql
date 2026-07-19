ALTER TABLE "clients" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "owner_client_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_portal_token_unique" UNIQUE("portal_token");