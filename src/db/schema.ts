import {
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const entries = pgTable('entries', {
  id: serial('id').primaryKey(),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  period: varchar('period', { length: 10 }).notNull(), // 'morning' | 'afternoon' | 'evening'
  energy: smallint('energy').notNull(),
  mood: smallint('mood').notNull(),
  anxiety: smallint('anxiety').notNull(),
  comment: text('comment'),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
