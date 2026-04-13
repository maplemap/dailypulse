CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period" varchar(10) NOT NULL,
	"energy" smallint NOT NULL,
	"mood" smallint NOT NULL,
	"anxiety" smallint NOT NULL,
	"activity" smallint NOT NULL,
	"comment" text
);
