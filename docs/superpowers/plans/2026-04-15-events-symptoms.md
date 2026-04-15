# Events & Symptoms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ad-hoc Events and Symptoms tracking with predefined type lists, inline logging flow, and inclusion in AI analysis and stats.

**Architecture:** Two new DB tables (`event_types`, `event_logs`). New `src/bot/events.ts` handles logging and management conversations. Existing `analyze.ts` and `commands.ts` updated to include event/symptom data.

**Tech Stack:** TypeScript, drizzle-orm, grammy + @grammyjs/conversations, PostgreSQL 16, node-cron.

---

## File Map

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `eventTypes`, `eventLogs` tables + types |
| `src/db/migrations/` | Auto-generated via `npm run db:generate` |
| `src/db/repository.ts` | Add 7 new functions for event CRUD + queries |
| `src/bot/events.ts` | **New** — log flow + management conversations |
| `src/bot/commands.ts` | Update keyboard, update `handleStats`, update `runAnalysis` |
| `src/bot/items-menu.ts` | Rename `⚙️ Айтеми` → `⚙️ Заплановані` |
| `src/bot/index.ts` | Register `log_event`, `log_symptom` conversations |
| `src/ai/analyze.ts` | Add `EventLogRow` type, update `generateAnalysis` signature |
| `src/scheduler/index.ts` | Pass event logs to `generateAnalysis` |

---

### Task 1: Update DB schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add tables to schema**

Open `src/db/schema.ts` and append after the existing table definitions:

```typescript
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
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate
```

Expected: new file created in `src/db/migrations/` (e.g. `0003_*.sql`) with `CREATE TABLE event_types` and `CREATE TABLE event_logs`.

- [ ] **Step 3: Verify migration SQL**

Open the generated migration file. Confirm it contains:
```sql
CREATE TABLE "event_types" (...)
CREATE TABLE "event_logs" (...)
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat: add event_types and event_logs schema"
```

---

### Task 2: Add repository functions

**Files:**
- Modify: `src/db/repository.ts`

- [ ] **Step 1: Update imports**

Change the top import line in `src/db/repository.ts`:

```typescript
import { and, asc, avg, count, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  entries,
  entryValues,
  trackingItems,
  eventTypes,
  eventLogs,
  type NewTrackingItem,
  type TrackingItem,
  type EventType,
} from './schema.js';
```

- [ ] **Step 2: Add event type functions**

Append after `archiveItem` and `deleteItem`:

```typescript
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
```

- [ ] **Step 3: Add event log functions**

Append after `deleteEventType`:

```typescript
// ─── Event Logs ──────────────────────────────────────────────────

export async function createEventLog(eventTypeId: number, comment?: string): Promise<void> {
  await db.insert(eventLogs).values({ eventTypeId, comment: comment ?? null });
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
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.ts
git commit -m "feat: add event type and event log repository functions"
```

---

### Task 3: Create bot/events.ts

**Files:**
- Create: `src/bot/events.ts`

- [ ] **Step 1: Create the file**

Create `src/bot/events.ts` with full content:

```typescript
import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from './types.js';
import {
  getActiveEventTypes,
  getAllEventTypes,
  createEventType,
  createEventLog,
  deactivateEventType,
  deleteEventType,
} from '../db/repository.js';

type Category = 'event' | 'symptom';

const LABELS: Record<Category, string> = {
  event: '⚡ Подія',
  symptom: '🤒 Симптом',
};

async function buildTypeKeyboard(category: Category) {
  const types = await getActiveEventTypes(category);
  const keyboard = new InlineKeyboard();
  for (const t of types) {
    keyboard.text(t.name, `logtype_${t.id}`).row();
  }
  keyboard
    .text('➕ Новий', 'lognew')
    .text('⚙️ Керувати', 'logmanage')
    .row()
    .text('❌ Скасувати', 'logcancel');
  return keyboard;
}

async function handleManagement(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  category: Category,
) {
  while (true) {
    const types = await conversation.external(() => getAllEventTypes(category));

    const keyboard = new InlineKeyboard();
    for (const t of types) {
      keyboard.text(`${t.isActive ? '✅' : '📦'} ${t.name}`, 'noop').row();
      if (t.isActive) {
        keyboard.text('📦 Деактивувати', `mgmt_deact_${t.id}`);
      }
      keyboard.text('🗑️ Видалити', `mgmt_del_${t.id}`).row();
    }
    keyboard.text('← Назад', 'mgmt_back');

    const msg = await ctx.reply('⚙️ Керування:', { reply_markup: keyboard });

    const cbCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    const data = cbCtx.callbackQuery.data;
    await cbCtx.answerCallbackQuery();
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id);

    if (data === 'mgmt_back' || data === 'noop') {
      if (data === 'mgmt_back') return;
      continue;
    }

    if (data.startsWith('mgmt_deact_')) {
      const id = parseInt(data.replace('mgmt_deact_', ''));
      await conversation.external(() => deactivateEventType(id));
      continue;
    }

    if (data.startsWith('mgmt_del_')) {
      const id = parseInt(data.replace('mgmt_del_', ''));
      const confirmKeyboard = new InlineKeyboard()
        .text('✅ Так, видалити', `mgmt_delconf_${id}`)
        .text('❌ Скасувати', 'mgmt_delcancel');

      const confirmMsg = await ctx.reply('🗑️ Видалити разом з усіма логами?', {
        reply_markup: confirmKeyboard,
      });

      const confirmCtx = await conversation.waitFor('callback_query:data', {
        otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
      });
      const confirmData = confirmCtx.callbackQuery.data;
      await confirmCtx.answerCallbackQuery();
      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, confirmMsg.message_id);

      if (confirmData.startsWith('mgmt_delconf_')) {
        const deleteId = parseInt(confirmData.replace('mgmt_delconf_', ''));
        await conversation.external(() => deleteEventType(deleteId));
      }
      continue;
    }
  }
}

async function logFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  category: Category,
) {
  while (true) {
    const keyboard = await conversation.external(() => buildTypeKeyboard(category));
    const msg = await ctx.reply(`${LABELS[category]} — вибери або додай:`, {
      reply_markup: keyboard,
    });

    const cbCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    const data = cbCtx.callbackQuery.data;
    await cbCtx.answerCallbackQuery();
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id);

    if (data === 'logcancel') return;

    if (data === 'logmanage') {
      await handleManagement(conversation, ctx, category);
      continue;
    }

    let eventTypeId: number;

    if (data === 'lognew') {
      await ctx.reply('Введи назву:');
      const nameCtx = await conversation.waitFor('message:text', {
        otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
      });
      const name = nameCtx.message.text.trim();
      const newType = await conversation.external(() => createEventType(name, category));
      eventTypeId = newType.id;
    } else if (data.startsWith('logtype_')) {
      eventTypeId = parseInt(data.replace('logtype_', ''));
    } else {
      continue;
    }

    await ctx.reply('Коментар? (або /skip)');
    const commentCtx = await conversation.waitFor('message:text', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    const commentText = commentCtx.message.text.trim();
    const comment = commentText === '/skip' ? undefined : commentText;

    await conversation.external(() => createEventLog(eventTypeId, comment));
    await ctx.reply('✅ Записано!');
    return;
  }
}

export async function logEventFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await logFlow(conversation, ctx, 'event');
}

export async function logSymptomFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await logFlow(conversation, ctx, 'symptom');
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/events.ts
git commit -m "feat: add log event and symptom conversation flows"
```

---

### Task 4: Update commands.ts

**Files:**
- Modify: `src/bot/commands.ts`

- [ ] **Step 1: Update imports**

Add `getEventLogsWithTypes` and `getEventStats` to the import from `'../db/repository.js'`:

```typescript
import { getEntriesWithValues, getStats, getEventLogsWithTypes, getEventStats } from '../db/repository.js';
```

- [ ] **Step 2: Update main keyboard**

Replace the existing `mainKeyboard` definition:

```typescript
export const mainKeyboard = new Keyboard()
  .text('✏️ Заповнити').text('📊 Статистика').row()
  .text('🔍 Аналіз').text('📋 Детальний звіт').row()
  .text('⚡ Подія').text('🤒 Симптом').row()
  .text('⚙️ Заплановані')
  .resized()
  .persistent();
```

- [ ] **Step 3: Update handleStats**

Replace the existing `handleStats` function:

```typescript
async function handleStats(ctx: Context) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [rows, eventRows] = await Promise.all([
    getStats(weekAgo, now),
    getEventStats(weekAgo, now),
  ]);

  if (rows.length === 0 && eventRows.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  const parts: string[] = ['📊 *Статистика за тиждень*'];

  if (rows.length > 0) {
    const fmt = (v: string | null) => (v ? Number(v).toFixed(1) : '—');
    parts.push('*Заплановані:*\n' + rows.map((r) => `• ${r.itemName}: ${fmt(r.avg)}/10`).join('\n'));
  }

  const symptoms = eventRows.filter((r) => r.category === 'symptom');
  const events = eventRows.filter((r) => r.category === 'event');

  if (symptoms.length > 0) {
    const total = symptoms.reduce((s, r) => s + Number(r.count), 0);
    parts.push(
      `*Симптоми (${total} разів):*\n` +
        symptoms.map((r) => `• ${r.name} — ${r.count}`).join('\n'),
    );
  }

  if (events.length > 0) {
    const total = events.reduce((s, r) => s + Number(r.count), 0);
    parts.push(
      `*Події (${total} разів):*\n` +
        events.map((r) => `• ${r.name} — ${r.count}`).join('\n'),
    );
  }

  await ctx.reply(parts.join('\n\n'), { parse_mode: 'Markdown' });
}
```

- [ ] **Step 4: Update runAnalysis to include event logs**

Inside `runAnalysis`, replace:

```typescript
  const rows = await getEntriesWithValues(weekAgo, now);

  if (rows.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }
```

With:

```typescript
  const [rows, eventRows] = await Promise.all([
    getEntriesWithValues(weekAgo, now),
    getEventLogsWithTypes(weekAgo, now),
  ]);

  if (rows.length === 0 && eventRows.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }
```

And replace the `generateAnalysis` call:

```typescript
    const analysis = await generateAnalysis(rows, 'week', mode, controller.signal);
```

With:

```typescript
    const analysis = await generateAnalysis(rows, 'week', mode, controller.signal, eventRows);
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: errors about `generateAnalysis` signature — that's fine, fix in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/bot/commands.ts
git commit -m "feat: update keyboard and stats to include events/symptoms"
```

---

### Task 5: Rename ⚙️ Айтеми in items-menu.ts

**Files:**
- Modify: `src/bot/items-menu.ts`

- [ ] **Step 1: Replace the hears trigger**

In `registerItemsMenu`, change:

```typescript
  bot.hears('⚙️ Айтеми', async (ctx) => sendItemsMenu(ctx));
```

To:

```typescript
  bot.hears('⚙️ Заплановані', async (ctx) => sendItemsMenu(ctx));
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/items-menu.ts
git commit -m "refactor: rename Айтеми to Заплановані"
```

---

### Task 6: Update ai/analyze.ts

**Files:**
- Modify: `src/ai/analyze.ts`

- [ ] **Step 1: Add EventLogRow type and formatEventRows function**

After the existing `EntryRow` type definition, add:

```typescript
export type EventLogRow = {
  recordedAt: Date;
  name: string;
  category: string;
  comment: string | null;
};

function formatEventRows(rows: EventLogRow[]): string {
  return rows
    .map((r) => {
      const type = r.category === 'event' ? 'Подія' : 'Симптом';
      const comment = r.comment ? ` — "${r.comment}"` : '';
      const date = r.recordedAt.toISOString().slice(0, 16).replace('T', ' ');
      return `${date} | ${type}: ${r.name}${comment}`;
    })
    .join('\n');
}
```

- [ ] **Step 2: Update generateAnalysis signature**

Change the function signature to accept an optional `eventRows` parameter:

```typescript
export async function generateAnalysis(
  rows: EntryRow[],
  period: 'week' | 'month',
  mode: 'brief' | 'detailed' = 'brief',
  signal?: AbortSignal,
  eventRows: EventLogRow[] = [],
): Promise<string> {
```

- [ ] **Step 3: Include event rows in the user message**

Inside `generateAnalysis`, replace the messages array's user content:

```typescript
      messages: [
        {
          role: 'user',
          content: `Ось мої записи за ${periodLabel}:\n\n${formatEntries(rows)}${
            eventRows.length > 0
              ? `\n\nПодії та симптоми:\n${formatEventRows(eventRows)}`
              : ''
          }\n\n${modePrompt}`,
        },
      ],
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ai/analyze.ts
git commit -m "feat: include events/symptoms in AI analysis"
```

---

### Task 7: Update scheduler/index.ts

**Files:**
- Modify: `src/scheduler/index.ts`

- [ ] **Step 1: Update imports**

Add `getEventLogsWithTypes` to the import:

```typescript
import { getEntriesWithValues, getEventLogsWithTypes } from '../db/repository.js';
```

- [ ] **Step 2: Update weekly report**

Inside the weekly report cron, replace:

```typescript
    const rows = await getEntriesWithValues(weekAgo, now);

    if (rows.length === 0) {
      await bot.api.sendMessage(
        CHAT_ID,
        '📊 Цього тижня немає записів для аналізу.',
      );
      return;
    }

    await bot.api.sendMessage(CHAT_ID, '📊 Готую тижневий AI-звіт...');
    const analysis = await generateAnalysis(rows, 'week', 'detailed');
```

With:

```typescript
    const [rows, eventRows] = await Promise.all([
      getEntriesWithValues(weekAgo, now),
      getEventLogsWithTypes(weekAgo, now),
    ]);

    if (rows.length === 0 && eventRows.length === 0) {
      await bot.api.sendMessage(
        CHAT_ID,
        '📊 Цього тижня немає записів для аналізу.',
      );
      return;
    }

    await bot.api.sendMessage(CHAT_ID, '📊 Готую тижневий AI-звіт...');
    const analysis = await generateAnalysis(rows, 'week', 'detailed', undefined, eventRows);
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/scheduler/index.ts
git commit -m "feat: include events/symptoms in weekly scheduler report"
```

---

### Task 8: Register conversations in bot/index.ts

**Files:**
- Modify: `src/bot/index.ts`

- [ ] **Step 1: Update imports and registrations**

Replace the existing `bot/index.ts` content:

```typescript
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { friendlyError } from './errors.js';
import { registerCommands, mainKeyboard } from './commands.js';
import { registerItemsMenu, addItemFlow, editItemFlow } from './items-menu.js';
import { fillFlow } from './flow.js';
import { logEventFlow, logSymptomFlow } from './events.js';
import type { BotContext, SessionData } from './types.js';

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(
    session({
      initial: (): SessionData => ({}),
    }),
  );
  bot.use(conversations<BotContext, BotContext>());
  bot.use(createConversation<BotContext, BotContext>(fillFlow, 'fill'));
  bot.use(createConversation<BotContext, BotContext>(addItemFlow, 'add_item'));
  bot.use(createConversation<BotContext, BotContext>(editItemFlow, 'edit_item'));
  bot.use(createConversation<BotContext, BotContext>(logEventFlow, 'log_event'));
  bot.use(createConversation<BotContext, BotContext>(logSymptomFlow, 'log_symptom'));

  bot.use(async (ctx, next) => {
    if (ctx.chat?.id.toString() !== config.telegramChatId) return;
    await next();
  });

  registerCommands(bot);
  registerItemsMenu(bot);

  bot.hears('⚡ Подія', (ctx) => ctx.conversation.enter('log_event'));
  bot.hears('🤒 Симптом', (ctx) => ctx.conversation.enter('log_symptom'));

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

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/index.ts
git commit -m "feat: register log_event and log_symptom conversations"
```

---

### Task 9: Integration test

- [ ] **Step 1: Restart bot**

```bash
make stop && make run
```

Expected in logs:
```
Migrations applied
Scheduler started (timezone: Europe/Kyiv)
```

- [ ] **Step 2: Test main keyboard**

Send any message to the bot. Verify the keyboard shows:
```
✏️ Заповнити  |  📊 Статистика
🔍 Аналіз    |  📋 Детальний звіт
⚡ Подія     |  🤒 Симптом
⚙️ Заплановані
```

- [ ] **Step 3: Test log event flow**

Tap "⚡ Подія":
- First time: only "➕ Новий", "⚙️ Керувати", "❌ Скасувати" (no types yet)
- Tap "➕ Новий" → enter "Йога" → enter comment or /skip → "✅ Записано!"

Tap "⚡ Подія" again:
- "Йога" should now appear in the list
- Select it → comment → "✅ Записано!"

- [ ] **Step 4: Test management flow**

Tap "⚡ Подія" → "⚙️ Керувати":
- Verify "Йога" appears with "📦 Деактивувати" and "🗑️ Видалити" buttons
- Deactivate → verify "Йога" disappears from logging keyboard (isActive=false)
- Add new type → verify it appears
- Delete → confirm → verify it's gone

- [ ] **Step 5: Test symptom flow**

Tap "🤒 Симптом" → add "Головний біль" → /skip comment → "✅ Записано!"

- [ ] **Step 6: Test stats**

Tap "📊 Статистика" → verify Events and Symptoms sections appear alongside planned items.

- [ ] **Step 7: Verify no errors in logs**

```bash
make logs
```

Expected: no `Bot error:` lines during normal usage.

- [ ] **Step 8: Commit if not already done**

All changes should already be committed from previous tasks.

---

### Task 10: Update docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.local.md`

- [ ] **Step 1: Update README.md**

In the Features/Commands section, add:
- "⚡ Подія / 🤒 Симптом — log events and symptoms on demand with optional comment"

In the Bot Commands section, add:
- `⚡ Подія` — log an ad-hoc event
- `🤒 Симптом` — log a symptom

- [ ] **Step 2: Update CLAUDE.local.md**

Update the main keyboard diagram and add a section for Events & Symptoms.

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.local.md
git commit -m "docs: update README and CLAUDE.local.md for events/symptoms feature"
```
