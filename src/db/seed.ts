import { db } from './index.js';
import { trackingItems } from './schema.js';

export async function seedDefaultItems(): Promise<void> {
  const existing = await db.select().from(trackingItems).limit(1);
  if (existing.length > 0) return;

  await db.insert(trackingItems).values([
    {
      name: 'Енергія',
      type: 'scale',
      periods: ['morning', 'afternoon', 'evening'],
      sortOrder: 0,
    },
    {
      name: 'Настрій',
      type: 'scale',
      periods: ['morning', 'afternoon', 'evening'],
      sortOrder: 1,
    },
    {
      name: 'Тривожність',
      type: 'scale',
      periods: ['morning', 'afternoon', 'evening'],
      sortOrder: 2,
    },
  ]);

  console.log('Default tracking items seeded');
}
