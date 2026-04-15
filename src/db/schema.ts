import {
  boolean,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const trackingItems = pgTable('tracking_items', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'scale' | 'boolean' | 'text'
  periods: text('periods')
    .array()
    .notNull()
    .default(sql`ARRAY['morning','afternoon','evening']::text[]`),
  sortOrder: smallint('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const entries = pgTable('entries', {
  id: serial('id').primaryKey(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  period: varchar('period', { length: 10 }).notNull(), // 'morning' | 'afternoon' | 'evening'
});

export const entryValues = pgTable('entry_values', {
  id: serial('id').primaryKey(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => entries.id),
  itemId: integer('item_id')
    .notNull()
    .references(() => trackingItems.id),
  value: text('value').notNull(), // "7" | "true" | "free text"
});

export type TrackingItem = typeof trackingItems.$inferSelect;
export type NewTrackingItem = typeof trackingItems.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryValue = typeof entryValues.$inferSelect;

export const eventTypes = pgTable('event_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 10 }).notNull(), // 'event' | 'symptom'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventLogs = pgTable('event_logs', {
  id: serial('id').primaryKey(),
  eventTypeId: integer('event_type_id')
    .notNull()
    .references(() => eventTypes.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  comment: text('comment'),
});

export type EventType = typeof eventTypes.$inferSelect;
export type NewEventType = typeof eventTypes.$inferInsert;
export type EventLog = typeof eventLogs.$inferSelect;

export const journalEntries = pgTable('journal_entries', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntries.$inferSelect;
