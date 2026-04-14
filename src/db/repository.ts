import { and, avg, gte, lte } from 'drizzle-orm';
import { db } from './index.js';
import { entries, type NewEntry, type Entry } from './schema.js';

export async function createEntry(data: NewEntry): Promise<Entry> {
  const [entry] = await db.insert(entries).values(data).returning();
  return entry;
}

export async function getEntriesByPeriod(
  from: Date,
  to: Date,
): Promise<Entry[]> {
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.recordedAt, from), lte(entries.recordedAt, to)))
    .orderBy(entries.recordedAt);
}

export async function getStats(from: Date, to: Date) {
  const [result] = await db
    .select({
      avgEnergy: avg(entries.energy),
      avgMood: avg(entries.mood),
      avgAnxiety: avg(entries.anxiety),
    })
    .from(entries)
    .where(and(gte(entries.recordedAt, from), lte(entries.recordedAt, to)));

  return result;
}
