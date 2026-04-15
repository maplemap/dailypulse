CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
