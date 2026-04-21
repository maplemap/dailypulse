import { and, asc, avg, count, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  entries,
  entryValues,
  trackingItems,
  eventTypes,
  eventLogs,
  journalEntries,
  type NewTrackingItem,
  type TrackingItem,
  type EventType,
} from './schema.js';

// ─── Tracking Items ──────────────────────────────────────────────

export async function getActiveItems(period?: string): Promise<TrackingItem[]> {
  const all = await db
    .select()
    .from(trackingItems)
    .where(and(eq(trackingItems.isActive, true), isNull(trackingItems.archivedAt)))
    .orderBy(asc(trackingItems.sortOrder));

  if (!period) return all;
  return all.filter((item) => item.periods?.includes(period));
}

export async function getAllItems(): Promise<TrackingItem[]> {
  return db.select().from(trackingItems).orderBy(asc(trackingItems.sortOrder));
}

export async function createItem(data: NewTrackingItem): Promise<TrackingItem> {
  const [item] = await db.insert(trackingItems).values(data).returning();
  return item;
}

export async function updateItem(
  id: number,
  data: Partial<Pick<NewTrackingItem, 'name' | 'periods' | 'sortOrder'>>,
): Promise<TrackingItem> {
  const [item] = await db
    .update(trackingItems)
    .set(data)
    .where(eq(trackingItems.id, id))
    .returning();
  return item;
}

export async function archiveItem(id: number): Promise<void> {
  await db
    .update(trackingItems)
    .set({ isActive: false, archivedAt: new Date() })
    .where(eq(trackingItems.id, id));
}

export async function unarchiveItem(id: number): Promise<void> {
  await db
    .update(trackingItems)
    .set({ isActive: true, archivedAt: null })
    .where(eq(trackingItems.id, id));
}

export async function deleteItem(id: number): Promise<void> {
  await db.delete(entryValues).where(eq(entryValues.itemId, id));
  await db.delete(trackingItems).where(eq(trackingItems.id, id));
}

// ─── Event Types ─────────────────────────────────────────────────

export async function getActiveEventTypes(category: string): Promise<EventType[]> {
  return db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.category, category), eq(eventTypes.isActive, true)))
    .orderBy(asc(eventTypes.createdAt));
}

export async function getAllEventTypes(category: string): Promise<EventType[]> {
  return db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.category, category))
    .orderBy(asc(eventTypes.createdAt));
}

export async function createEventType(name: string, category: string): Promise<EventType> {
  const [item] = await db.insert(eventTypes).values({ name, category }).returning();
  return item;
}

export async function deactivateEventType(id: number): Promise<void> {
  await db.update(eventTypes).set({ isActive: false }).where(eq(eventTypes.id, id));
}

export async function deleteEventType(id: number): Promise<void> {
  await db.delete(eventLogs).where(eq(eventLogs.eventTypeId, id));
  await db.delete(eventTypes).where(eq(eventTypes.id, id));
}

// ─── Event Logs ──────────────────────────────────────────────────

export async function createEventLog(eventTypeId: number): Promise<number> {
  const [row] = await db.insert(eventLogs).values({ eventTypeId, comment: null }).returning({ id: eventLogs.id });
  return row.id;
}

export async function updateEventLogComment(id: number, comment: string): Promise<void> {
  await db.update(eventLogs).set({ comment }).where(eq(eventLogs.id, id));
}

export async function getEventLogsWithTypes(from: Date, to: Date) {
  return db
    .select({
      recordedAt: eventLogs.recordedAt,
      name: eventTypes.name,
      category: eventTypes.category,
      comment: eventLogs.comment,
    })
    .from(eventLogs)
    .innerJoin(eventTypes, eq(eventTypes.id, eventLogs.eventTypeId))
    .where(and(gte(eventLogs.recordedAt, from), lte(eventLogs.recordedAt, to)))
    .orderBy(asc(eventLogs.recordedAt));
}

export async function getEventStats(from: Date, to: Date) {
  return db
    .select({
      name: eventTypes.name,
      category: eventTypes.category,
      count: count(),
    })
    .from(eventLogs)
    .innerJoin(eventTypes, eq(eventTypes.id, eventLogs.eventTypeId))
    .where(and(gte(eventLogs.recordedAt, from), lte(eventLogs.recordedAt, to)))
    .groupBy(eventTypes.name, eventTypes.category)
    .orderBy(eventTypes.category, eventTypes.name);
}

// ─── Journal ─────────────────────────────────────────────────────

export async function createJournalEntry(text: string): Promise<void> {
  await db.insert(journalEntries).values({ text });
}

export async function getJournalEntries(from: Date, to: Date) {
  return db
    .select({ recordedAt: journalEntries.recordedAt, text: journalEntries.text })
    .from(journalEntries)
    .where(and(gte(journalEntries.recordedAt, from), lte(journalEntries.recordedAt, to)))
    .orderBy(asc(journalEntries.recordedAt));
}

// ─── Entries ─────────────────────────────────────────────────────

export async function createEntry(
  period: string,
  values: { itemId: number; value: string }[],
): Promise<void> {
  const [entry] = await db.insert(entries).values({ period }).returning();

  if (values.length > 0) {
    await db.insert(entryValues).values(
      values.map((v) => ({ entryId: entry.id, itemId: v.itemId, value: v.value })),
    );
  }
}

export async function getEntriesWithValues(from: Date, to: Date) {
  return db
    .select({
      entryId: entries.id,
      recordedAt: entries.recordedAt,
      period: entries.period,
      itemName: trackingItems.name,
      itemType: trackingItems.type,
      value: entryValues.value,
    })
    .from(entries)
    .innerJoin(entryValues, eq(entryValues.entryId, entries.id))
    .innerJoin(trackingItems, eq(trackingItems.id, entryValues.itemId))
    .where(and(gte(entries.recordedAt, from), lte(entries.recordedAt, to)))
    .orderBy(asc(entries.recordedAt));
}

export async function getStats(from: Date, to: Date) {
  const rows = await db
    .select({
      itemName: trackingItems.name,
      avg: avg(sql<number>`${entryValues.value}::numeric`),
    })
    .from(entryValues)
    .innerJoin(entries, eq(entries.id, entryValues.entryId))
    .innerJoin(trackingItems, eq(trackingItems.id, entryValues.itemId))
    .where(
      and(
        gte(entries.recordedAt, from),
        lte(entries.recordedAt, to),
        eq(trackingItems.type, 'scale'),
      ),
    )
    .groupBy(trackingItems.name);

  return rows;
}
