CREATE TABLE "event_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;