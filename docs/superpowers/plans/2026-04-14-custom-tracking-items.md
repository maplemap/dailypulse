# Custom Tracking Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed entry fields (energy, mood, anxiety) with user-defined tracking items of three types: scale (1–10), boolean, or text — with per-period assignment and archiving.

**Architecture:** New `tracking_items` table defines available items; new `entry_values` table stores values per entry per item (EAV pattern). Existing `entries` table retains only metadata (id, recorded_at, period). The fill flow becomes dynamic — fetches active items for the current period. Item management is handled via inline keyboard menu.

**Tech Stack:** Node.js + TypeScript, grammy + @grammyjs/conversations, drizzle-orm, PostgreSQL 16

> ⚠️ **Note:** Running the migration will drop `energy`, `mood`, `anxiety` columns from `entries`. Existing entry values will be lost. This is acceptable for the current testing phase.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/db/schema.ts` | Modify | Add `trackingItems`, `entryValues`; strip `entries` |
| `src/db/seed.ts` | Create | Seed default items on first run |
| `src/db/repository.ts` | Modify | Item CRUD + updated entry functions |
| `src/bot/types.ts` | Modify | Add `editingItemId` to SessionData |
| `src/bot/flow.ts` | Modify | Dynamic fill flow |
| `src/bot/items-menu.ts` | Create | Inline menu + add/edit conversations |
| `src/bot/commands.ts` | Modify | Add ⚙️ button, register items handlers |
| `src/bot/index.ts` | Modify | Register new conversations |
| `src/ai/analyze.ts` | Modify | Dynamic prompt from active items |
| `src/index.ts` | Modify | Call seed after migrations |
| `README.md` | Modify | Update architecture and commands |
| `CLAUDE.local.md` | Modify | Update project notes |

---

## Task 1: Update DB Schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Replace contents of `src/db/schema.ts`**

```typescript
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
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate
```

Expected: new file created in `src/db/migrations/` with SQL that creates `tracking_items`, `entry_values` and drops `energy`, `mood`, `anxiety` from `entries`.

- [ ] **Step 3: Apply migration**

```bash
npm run db:migrate
```

Expected: `No config path provided, using default` then migration applied successfully.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors (repository.ts will have errors — fix in Task 3).

---

## Task 2: Seed Default Items

**Files:**
- Create: `src/db/seed.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/db/seed.ts`**

```typescript
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
```

- [ ] **Step 2: Call seed in `src/index.ts` after migrations**

```typescript
import 'dotenv/config';
import { createBot } from './bot/index.js';
import { startScheduler } from './scheduler/index.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seedDefaultItems } from './db/seed.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('Starting DailyPulse...');

  await migrate(db, {
    migrationsFolder: join(__dirname, 'db', 'migrations'),
  });
  console.log('Migrations applied');

  await seedDefaultItems();

  const bot = createBot();
  startScheduler(bot);

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop());
  process.once('SIGTERM', () => bot.stop());

  await bot.start();
  console.log('Bot is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts src/db/seed.ts src/index.ts src/db/migrations/
git commit -m "feat: add tracking_items and entry_values schema with seed"
```

---

## Task 3: Update Repository

**Files:**
- Modify: `src/db/repository.ts`

- [ ] **Step 1: Replace contents of `src/db/repository.ts`**

```typescript
import { and, asc, avg, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  entries,
  entryValues,
  trackingItems,
  type NewTrackingItem,
  type TrackingItem,
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
  // Returns avg per item name for scale items only
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: errors only in `bot/flow.ts` and `bot/commands.ts` (fixed in next tasks).

- [ ] **Step 3: Commit**

```bash
git add src/db/repository.ts
git commit -m "feat: update repository for EAV schema"
```

---

## Task 4: Update Session Type

**Files:**
- Modify: `src/bot/types.ts`

- [ ] **Step 1: Add `editingItemId` to SessionData**

```typescript
import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

export type SessionData = {
  editingItemId?: number;
};

type BaseContext = Context & SessionFlavor<SessionData>;
export type BotContext = ConversationFlavor<BaseContext>;
```

- [ ] **Step 2: Update session initial value in `src/bot/index.ts`**

Change:
```typescript
session({
  initial: (): SessionData => ({}),
}),
```

To:
```typescript
session({
  initial: (): SessionData => ({ editingItemId: undefined }),
}),
```

---

## Task 5: Update Dynamic Fill Flow

**Files:**
- Modify: `src/bot/flow.ts`

- [ ] **Step 1: Replace contents of `src/bot/flow.ts`**

```typescript
import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from './types.js';
import { createEntry, getActiveItems } from '../db/repository.js';

type Period = 'morning' | 'afternoon' | 'evening';

function getCurrentPeriod(): Period {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function buildScoreKeyboard() {
  const keyboard = new InlineKeyboard();
  for (let i = 1; i <= 5; i++) keyboard.text(String(i), `score_${i}`);
  keyboard.row();
  for (let i = 6; i <= 10; i++) keyboard.text(String(i), `score_${i}`);
  return keyboard;
}

const booleanKeyboard = new InlineKeyboard()
  .text('✅ Так', 'bool_true')
  .text('❌ Ні', 'bool_false');

async function askScore(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string> {
  await ctx.reply(question, { reply_markup: buildScoreKeyboard(), parse_mode: 'Markdown' });

  const callbackCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (ctx) => ctx.answerCallbackQuery(),
  });

  const data = callbackCtx.callbackQuery.data;

  if (!data.startsWith('score_')) {
    await callbackCtx.answerCallbackQuery();
    return askScore(conversation, ctx, question);
  }

  await callbackCtx.answerCallbackQuery();
  await callbackCtx.editMessageReplyMarkup();
  return data.replace('score_', '');
}

async function askBoolean(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string> {
  await ctx.reply(question, { reply_markup: booleanKeyboard, parse_mode: 'Markdown' });

  const callbackCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (ctx) => ctx.answerCallbackQuery(),
  });

  const data = callbackCtx.callbackQuery.data;

  if (data !== 'bool_true' && data !== 'bool_false') {
    await callbackCtx.answerCallbackQuery();
    return askBoolean(conversation, ctx, question);
  }

  await callbackCtx.answerCallbackQuery();
  await callbackCtx.editMessageReplyMarkup();
  return data === 'bool_true' ? 'true' : 'false';
}

async function askText(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string | null> {
  await ctx.reply(question, { parse_mode: 'Markdown' });

  const msgCtx = await conversation.waitFor('message:text');
  const text = msgCtx.message.text;
  return text === '/skip' ? null : text;
}

export async function fillFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const period = getCurrentPeriod();
  const items = await conversation.external(() => getActiveItems(period));

  if (items.length === 0) {
    await ctx.reply(
      'Немає активних айтемів для цього часу. Налаштуй їх через *⚙️ Айтеми*.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const values: { itemId: number; value: string }[] = [];

  for (const item of items) {
    let value: string | null;

    if (item.type === 'scale') {
      value = await askScore(conversation, ctx, `*${item.name}* — оціни від 1 до 10`);
    } else if (item.type === 'boolean') {
      value = await askBoolean(conversation, ctx, `*${item.name}*`);
    } else {
      value = await askText(conversation, ctx, `*${item.name}* — напиши або /skip`);
    }

    if (value !== null) {
      values.push({ itemId: item.id, value });
    }
  }

  await conversation.external(() => createEntry(period, values));
  await ctx.reply('✅ Записано! Дякую.');
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: errors only in `commands.ts` (stats uses old fields — fixed in Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/bot/flow.ts src/bot/types.ts src/bot/index.ts
git commit -m "feat: dynamic fill flow based on tracking items"
```

---

## Task 6: Create Items Management Menu

**Files:**
- Create: `src/bot/items-menu.ts`

- [ ] **Step 1: Create `src/bot/items-menu.ts`**

```typescript
import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from './types.js';
import {
  getAllItems,
  getActiveItems,
  createItem,
  updateItem,
  archiveItem,
} from '../db/repository.js';
import type { TrackingItem } from '../db/schema.js';

const PERIOD_LABELS: Record<string, string> = {
  morning: '🌅 Ранок',
  afternoon: '☀️ День',
  evening: '🌙 Вечір',
};

const TYPE_LABELS: Record<string, string> = {
  scale: 'шкала 1–10',
  boolean: 'так/ні',
  text: 'текст',
};

// ─── Menu builders ────────────────────────────────────────────────

async function buildItemsListKeyboard(showArchived = false) {
  const all = await getAllItems();
  const active = all.filter((i) => i.isActive);
  const archived = all.filter((i) => !i.isActive);

  const keyboard = new InlineKeyboard();

  for (const item of active) {
    const periods = (item.periods ?? []).map((p) => PERIOD_LABELS[p] ?? p).join(', ');
    keyboard
      .text(`${item.name} (${TYPE_LABELS[item.type]})`, `noop`)
      .row()
      .text('✏️ Редагувати', `item_edit:${item.id}`)
      .text('📦 Архів', `item_archive_confirm:${item.id}`)
      .row();
  }

  keyboard.text('➕ Додати айтем', 'items_add').row();

  if (archived.length > 0) {
    if (showArchived) {
      keyboard.text('📦 Архівовані ▲', 'items_hide_archived').row();
      for (const item of archived) {
        keyboard.text(`${item.name} (архів)`, 'noop').row();
      }
    } else {
      keyboard.text(`📦 Архівовані (${archived.length}) ▼`, 'items_show_archived').row();
    }
  }

  return keyboard;
}

async function sendItemsMenu(ctx: Context, showArchived = false) {
  const keyboard = await buildItemsListKeyboard(showArchived);
  await ctx.reply('⚙️ *Мої айтеми*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function editItemsMenu(ctx: Context, showArchived = false) {
  const keyboard = await buildItemsListKeyboard(showArchived);
  await ctx.editMessageText('⚙️ *Мої айтеми*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ─── Add Item Conversation ────────────────────────────────────────

export async function addItemFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  // Step 1: Name
  await ctx.reply('Введи назву нового айтему:');
  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text.trim();

  // Step 2: Type
  const typeKeyboard = new InlineKeyboard()
    .text('📊 Шкала 1–10', 'type_scale')
    .text('✅ Так/Ні', 'type_boolean')
    .row()
    .text('📝 Текст', 'type_text');

  await ctx.reply('Виберіть тип:', { reply_markup: typeKeyboard });

  const typeCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (c) => c.answerCallbackQuery(),
  });
  await typeCtx.answerCallbackQuery();
  await typeCtx.editMessageReplyMarkup();

  const typeMap: Record<string, string> = {
    type_scale: 'scale',
    type_boolean: 'boolean',
    type_text: 'text',
  };
  const type = typeMap[typeCtx.callbackQuery.data] ?? 'scale';

  // Step 3: Periods (multi-select via toggle)
  const selected = new Set(['morning', 'afternoon', 'evening']);

  function buildPeriodsKeyboard() {
    return new InlineKeyboard()
      .text(selected.has('morning') ? '✅ Ранок' : '⬜ Ранок', 'toggle_morning')
      .text(selected.has('afternoon') ? '✅ День' : '⬜ День', 'toggle_afternoon')
      .text(selected.has('evening') ? '✅ Вечір' : '⬜ Вечір', 'toggle_evening')
      .row()
      .text('Підтвердити ✅', 'periods_confirm');
  }

  const periodsMsg = await ctx.reply('Для яких часів доби?', {
    reply_markup: buildPeriodsKeyboard(),
  });

  while (true) {
    const toggleCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => c.answerCallbackQuery(),
    });

    const d = toggleCtx.callbackQuery.data;
    await toggleCtx.answerCallbackQuery();

    if (d === 'periods_confirm') {
      await toggleCtx.editMessageReplyMarkup();
      break;
    }

    if (d === 'toggle_morning') selected.has('morning') ? selected.delete('morning') : selected.add('morning');
    if (d === 'toggle_afternoon') selected.has('afternoon') ? selected.delete('afternoon') : selected.add('afternoon');
    if (d === 'toggle_evening') selected.has('evening') ? selected.delete('evening') : selected.add('evening');

    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, periodsMsg.message_id, {
      reply_markup: buildPeriodsKeyboard(),
    });
  }

  await conversation.external(() =>
    createItem({ name, type, periods: Array.from(selected), sortOrder: 0 }),
  );

  await ctx.reply(`✅ Айтем *${name}* додано!`, { parse_mode: 'Markdown' });
  await sendItemsMenu(ctx);
}

// ─── Edit Item Conversation ───────────────────────────────────────

export async function editItemFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const itemId = ctx.session.editingItemId;
  if (!itemId) {
    await ctx.reply('Помилка: айтем не вибрано.');
    return;
  }

  const allItems = await conversation.external(() => getAllItems());
  const item = allItems.find((i) => i.id === itemId);
  if (!item) {
    await ctx.reply('Айтем не знайдено.');
    return;
  }

  const editKeyboard = new InlineKeyboard()
    .text('✏️ Назву', 'edit_name')
    .text('🕐 Часи доби', 'edit_periods');

  await ctx.reply(`Що змінити у *${item.name}*?`, {
    parse_mode: 'Markdown',
    reply_markup: editKeyboard,
  });

  const choiceCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (c) => c.answerCallbackQuery(),
  });
  await choiceCtx.answerCallbackQuery();
  await choiceCtx.editMessageReplyMarkup();

  if (choiceCtx.callbackQuery.data === 'edit_name') {
    await ctx.reply('Введи нову назву:');
    const nameCtx = await conversation.waitFor('message:text');
    const newName = nameCtx.message.text.trim();
    await conversation.external(() => updateItem(itemId, { name: newName }));
    await ctx.reply(`✅ Назву змінено на *${newName}*`, { parse_mode: 'Markdown' });
  } else {
    // Edit periods — same toggle UI as add
    const selected = new Set(item.periods ?? ['morning', 'afternoon', 'evening']);

    function buildPeriodsKeyboard() {
      return new InlineKeyboard()
        .text(selected.has('morning') ? '✅ Ранок' : '⬜ Ранок', 'toggle_morning')
        .text(selected.has('afternoon') ? '✅ День' : '⬜ День', 'toggle_afternoon')
        .text(selected.has('evening') ? '✅ Вечір' : '⬜ Вечір', 'toggle_evening')
        .row()
        .text('Підтвердити ✅', 'periods_confirm');
    }

    const periodsMsg = await ctx.reply('Вибери часи доби:', {
      reply_markup: buildPeriodsKeyboard(),
    });

    while (true) {
      const toggleCtx = await conversation.waitFor('callback_query:data', {
        otherwise: (c) => c.answerCallbackQuery(),
      });

      const d = toggleCtx.callbackQuery.data;
      await toggleCtx.answerCallbackQuery();

      if (d === 'periods_confirm') {
        await toggleCtx.editMessageReplyMarkup();
        break;
      }

      if (d === 'toggle_morning') selected.has('morning') ? selected.delete('morning') : selected.add('morning');
      if (d === 'toggle_afternoon') selected.has('afternoon') ? selected.delete('afternoon') : selected.add('afternoon');
      if (d === 'toggle_evening') selected.has('evening') ? selected.delete('evening') : selected.add('evening');

      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, periodsMsg.message_id, {
        reply_markup: buildPeriodsKeyboard(),
      });
    }

    await conversation.external(() =>
      updateItem(itemId, { periods: Array.from(selected) }),
    );
    await ctx.reply('✅ Часи доби оновлено.');
  }

  await sendItemsMenu(ctx);
}

// ─── Register handlers ────────────────────────────────────────────

export function registerItemsMenu(bot: Bot<BotContext>) {
  bot.hears('⚙️ Айтеми', async (ctx) => sendItemsMenu(ctx));
  bot.command('items', async (ctx) => sendItemsMenu(ctx));

  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery('items_add', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('add_item');
  });

  bot.callbackQuery(/^item_edit:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.editingItemId = parseInt(ctx.match[1]);
    await ctx.conversation.enter('edit_item');
  });

  bot.callbackQuery(/^item_archive_confirm:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1]);
    const all = await getAllItems();
    const item = all.find((i) => i.id === id);
    if (!item) return;

    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Так, архівувати', `item_archive:${id}`)
      .text('❌ Скасувати', 'items_menu');

    await ctx.editMessageText(
      `📦 Архівувати *${item.name}*?\nАйтем зникне з форми, але всі дані збережуться.`,
      { parse_mode: 'Markdown', reply_markup: confirmKeyboard },
    );
  });

  bot.callbackQuery(/^item_archive:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1]);
    await archiveItem(id);
    await editItemsMenu(ctx);
  });

  bot.callbackQuery('items_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx);
  });

  bot.callbackQuery('items_show_archived', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx, true);
  });

  bot.callbackQuery('items_hide_archived', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx, false);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/items-menu.ts
git commit -m "feat: items management inline menu with add/edit/archive"
```

---

## Task 7: Wire Up Items Menu in Bot

**Files:**
- Modify: `src/bot/index.ts`
- Modify: `src/bot/commands.ts`

- [ ] **Step 1: Register conversations and items menu in `src/bot/index.ts`**

```typescript
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { friendlyError } from './errors.js';
import { registerCommands, mainKeyboard } from './commands.js';
import { registerItemsMenu, addItemFlow, editItemFlow } from './items-menu.js';
import { fillFlow } from './flow.js';
import type { BotContext, SessionData } from './types.js';

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(
    session({
      initial: (): SessionData => ({ editingItemId: undefined }),
    }),
  );
  bot.use(conversations<BotContext, BotContext>());
  bot.use(createConversation<BotContext, BotContext>(fillFlow, 'fill'));
  bot.use(createConversation<BotContext, BotContext>(addItemFlow, 'add_item'));
  bot.use(createConversation<BotContext, BotContext>(editItemFlow, 'edit_item'));

  bot.use(async (ctx, next) => {
    if (ctx.chat?.id.toString() !== config.telegramChatId) return;
    await next();
  });

  registerCommands(bot);
  registerItemsMenu(bot);

  bot.on('message', async (ctx) => {
    await ctx.reply('Обери дію:', { reply_markup: mainKeyboard });
  });

  bot.catch(async (err) => {
    console.error('Bot error:', err);

    const text = friendlyError(err.error);

    try {
      if (err.ctx) {
        await err.ctx.reply(text, { parse_mode: 'Markdown' });
      } else {
        await bot.api.sendMessage(config.telegramChatId, text, { parse_mode: 'Markdown' });
      }
    } catch {
      // ignore send failure
    }
  });

  return bot;
}
```

- [ ] **Step 2: Add ⚙️ Айтеми button to mainKeyboard in `src/bot/commands.ts`**

Replace the `mainKeyboard` definition:

```typescript
export const mainKeyboard = new Keyboard()
  .text('✏️ Заповнити').text('📊 Статистика').row()
  .text('🔍 Аналіз').text('📋 Детальний звіт').row()
  .text('⚙️ Айтеми')
  .resized()
  .persistent();
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: errors only in `commands.ts` stats handler (uses old fields) and `ai/analyze.ts` — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add src/bot/index.ts src/bot/commands.ts
git commit -m "feat: register items menu conversations and add keyboard button"
```

---

## Task 8: Update Stats Command and AI Analysis

**Files:**
- Modify: `src/bot/commands.ts`
- Modify: `src/ai/analyze.ts`

- [ ] **Step 1: Update `handleStats` in `src/bot/commands.ts`**

Replace the `handleStats` function:

```typescript
async function handleStats(ctx: Context) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await getStats(weekAgo, now);

  if (rows.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  const fmt = (v: string | null) => (v ? Number(v).toFixed(1) : '—');

  const lines = rows.map((r) => `• ${r.itemName}: ${fmt(r.avg)}/10`).join('\n');

  await ctx.reply(`📊 *Статистика за тиждень*\n\n${lines}`, {
    parse_mode: 'Markdown',
  });
}
```

Update import in `commands.ts` — replace `getEntriesByPeriod, getStats` with:

```typescript
import { getEntriesByPeriod, getStats } from '../db/repository.js';
```

(no change needed — function names stay the same, only their signatures changed)

- [ ] **Step 2: Update `src/ai/analyze.ts` for dynamic items**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getActiveItems } from '../db/repository.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Ти — персональний AI-асистент для аналізу здоров'я та самопочуття.
Ти аналізуєш щоденні записи користувача про фізичний і ментальний стан.

Пиши українською мовою. Використовуй Markdown для форматування відповіді.`;

const BRIEF_PROMPT = `Дай стислий підсумок стану за цей період — 3-4 речення максимум.
Вкажи головну тенденцію і одну конкретну пораду. Без зайвих вступів і структури.`;

const DETAILED_PROMPT = `Надай детальний структурований звіт з розділами:
1. 📊 Загальна картина
2. ✅ Що покращилось
3. ⚠️ На що звернути увагу
4. 🔗 Кореляції між показниками
5. 💡 Порада на наступний період

Будь конкретним і actionable.`;

type EntryRow = {
  entryId: number;
  recordedAt: Date;
  period: string;
  itemName: string;
  itemType: string;
  value: string;
};

function buildItemsDescription(rows: EntryRow[]): string {
  const itemMap = new Map<string, string>();
  for (const r of rows) {
    if (!itemMap.has(r.itemName)) {
      const typeDesc =
        r.itemType === 'scale' ? 'шкала 1–10' : r.itemType === 'boolean' ? 'так/ні' : 'текст';
      itemMap.set(r.itemName, typeDesc);
    }
  }
  return Array.from(itemMap.entries())
    .map(([name, type]) => `- ${name} (${type})`)
    .join('\n');
}

function formatEntries(rows: EntryRow[]): string {
  // Group by entryId
  const grouped = new Map<number, { recordedAt: Date; period: string; values: Record<string, string> }>();
  for (const r of rows) {
    if (!grouped.has(r.entryId)) {
      grouped.set(r.entryId, { recordedAt: r.recordedAt, period: r.period, values: {} });
    }
    grouped.get(r.entryId)!.values[r.itemName] = r.value;
  }

  return JSON.stringify(
    Array.from(grouped.values()).map((e) => ({
      date: e.recordedAt,
      period: e.period,
      ...e.values,
    })),
    null,
    2,
  );
}

export async function generateAnalysis(
  rows: EntryRow[],
  period: 'week' | 'month',
  mode: 'brief' | 'detailed' = 'brief',
  signal?: AbortSignal,
): Promise<string> {
  const periodLabel = period === 'week' ? 'тиждень' : 'місяць';
  const modePrompt = mode === 'brief' ? BRIEF_PROMPT : DETAILED_PROMPT;
  const maxTokens = mode === 'brief' ? 300 : 2048;
  const itemsDescription = buildItemsDescription(rows);

  const systemWithItems = `${SYSTEM_PROMPT}\n\nКожен запис містить:\n${itemsDescription}`;

  const stream = client.messages.stream(
    {
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: systemWithItems,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Ось мої записи за ${periodLabel}:\n\n${formatEntries(rows)}\n\n${modePrompt}`,
        },
      ],
    },
    { signal },
  );

  const message = await stream.finalMessage();

  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text'
    ? textBlock.text
    : 'Не вдалося отримати аналіз.';
}
```

- [ ] **Step 3: Update `src/scheduler/index.ts` to use `getEntriesWithValues`**

Replace import and usage in the weekly report cron job:

```typescript
import { getEntriesWithValues } from '../db/repository.js';
```

In the weekly report cron (`'0 20 * * 0'`), replace:
```typescript
const entries = await getEntriesByPeriod(weekAgo, now);
if (entries.length === 0) { ... }
const analysis = await generateAnalysis(entries, 'week');
```

With:
```typescript
const rows = await getEntriesWithValues(weekAgo, now);
if (rows.length === 0) { ... }
const analysis = await generateAnalysis(rows, 'week');
```

- [ ] **Step 4: Update `runAnalysis` in `src/bot/commands.ts` to use `getEntriesWithValues`**

Replace import and `runAnalysis`:

```typescript
import { getEntriesWithValues, getStats } from '../db/repository.js';
```

```typescript
async function runAnalysis(ctx: Context, mode: 'brief' | 'detailed') {
  const chatId = ctx.chat!.id;

  if (pendingAnalysis.has(chatId)) {
    await ctx.reply('Аналіз вже виконується.');
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await getEntriesWithValues(weekAgo, now);

  if (rows.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  const label = mode === 'brief' ? '🔍 Аналізую...' : '📋 Готую детальний звіт...';
  const msg = await ctx.reply(label, { reply_markup: cancelKeyboard });

  const controller = new AbortController();
  pendingAnalysis.set(chatId, controller);

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId.toString(), 'typing').catch(() => {});
  }, 4000);

  await ctx.api.sendChatAction(chatId.toString(), 'typing');

  try {
    const analysis = await generateAnalysis(rows, 'week', mode, controller.signal);
    await ctx.api.editMessageText(chatId, msg.message_id, analysis, {
      parse_mode: 'Markdown',
    });
  } catch {
    const text = controller.signal.aborted
      ? '❌ Аналіз скасовано.'
      : '⚠️ Не вдалося отримати аналіз.';
    await ctx.api.editMessageText(chatId, msg.message_id, text).catch(() => {});
  } finally {
    clearInterval(typingInterval);
    pendingAnalysis.delete(chatId);
  }
}
```

- [ ] **Step 4: Verify full build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/bot/commands.ts src/ai/analyze.ts
git commit -m "feat: dynamic stats and AI analysis from entry_values"
```

---

## Task 9: Integration Test

- [ ] **Step 1: Rebuild and restart bot**

```bash
make stop && make run
```

- [ ] **Step 2: Test fill flow**

In Telegram:
1. Press ✏️ Заповнити
2. Verify Енергія, Настрій, Тривожність appear with scale keyboard
3. Complete the flow → should see ✅ Записано!

- [ ] **Step 3: Test items menu**

1. Press ⚙️ Айтеми → should see list with 3 default items
2. Press ➕ Додати айтем → add "Головний біль" as boolean, all periods
3. Press ✏️ Заповнити again → should now see 4 items including Головний біль with Так/Ні buttons
4. Press ✏️ next to Головний біль → edit name → verify change in menu
5. Press 📦 next to item → confirm archive → verify item disappears from fill flow

- [ ] **Step 4: Test analysis**

1. Press 🔍 Аналіз → should see Аналізую... with ❌ Скасувати
2. Wait for result → should include item names in analysis
3. Press 📊 Статистика → should show avg per scale item

---

## Task 10: Update Docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.local.md` (if exists)

- [ ] **Step 1: Update README.md**

Update the Features, Metrics, Commands and Project Structure sections to reflect:
- Custom tracking items instead of fixed fields
- New `/items` command
- New `tracking_items` and `entry_values` tables
- Updated database schema section

- [ ] **Step 2: Update CLAUDE.local.md if it exists**

Update any section that describes the tracking parameters or DB schema.

- [ ] **Step 3: Final commit**

```bash
git add README.md CLAUDE.local.md
git commit -m "docs: update README and CLAUDE.local.md for custom tracking items"
```
