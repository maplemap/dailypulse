CREATE TABLE "entry_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(10) NOT NULL,
	"periods" text[] DEFAULT ARRAY['morning','afternoon','evening']::text[] NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_values" ADD CONSTRAINT "entry_values_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_values" ADD CONSTRAINT "entry_values_item_id_tracking_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."tracking_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "energy";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "mood";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "anxiety";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "comment";