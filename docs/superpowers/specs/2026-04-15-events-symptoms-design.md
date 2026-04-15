# Events & Symptoms Tracking — Design Spec

## Goal

Add two new ad-hoc tracking categories — Events and Symptoms — alongside the existing scheduled items. Users can log these at any moment via dedicated main menu buttons.

## Architecture

Two new DB tables (`event_types`, `event_logs`) separate from the scheduled tracking system. Bot adds two new main menu buttons. AI analysis receives all three data streams together.

---

## Section 1: Data Model

```sql
event_types (
  id         serial PRIMARY KEY,
  name       varchar(100) NOT NULL,
  category   varchar(10) NOT NULL,   -- 'event' | 'symptom'
  isActive   boolean DEFAULT true,
  createdAt  timestamp DEFAULT now()
)

event_logs (
  id            serial PRIMARY KEY,
  eventTypeId   integer NOT NULL REFERENCES event_types(id),
  recordedAt    timestamp DEFAULT now(),
  comment       text     -- nullable
)
```

**Rationale:** Events and Symptoms are ad-hoc — they have no `periods`, `type` (scale/boolean), or `sortOrder`. Keeping them in dedicated tables avoids polluting `tracking_items` with nullable columns and conditional logic.

**Deletion policy:**
- **Deactivate** (`isActive = false`) — hides from logging UI, preserves `event_logs` for historical analysis
- **Hard delete** — removes `event_logs` first, then `event_types` (same pattern as `tracking_items`)

---

## Section 2: UX & Navigation

### Main keyboard (updated)

```
✏️ Заповнити  |  📊 Статистика
🔍 Аналіз    |  📋 Детальний звіт
⚡ Подія     |  🤒 Симптом
⚙️ Заплановані
```

Note: "⚙️ Айтеми" renamed to "⚙️ Заплановані".

### Logging flow (identical for Events and Symptoms)

```
Tap "⚡ Подія"
  → inline keyboard: [Йога] [Дефекація] ... [➕ Новий] [⚙️ Керувати]

  → Selected existing type:
      Bot: "Коментар? (або /skip)"
      → ✅ Записано!

  → ➕ Новий:
      Bot: "Введи назву:"
      User enters name → type created
      Bot: "Коментар? (або /skip)"
      → ✅ Записано! (type created and logged in one flow)

  → ⚙️ Керувати:
      Shows list of types with [Деактивувати] [🗑️ Видалити] per item
      Deactivate → isActive = false, hidden from logging UI
      Delete → confirm → delete event_logs + event_type
```

---

## Section 3: AI Analysis & Stats

### AI analysis

`generateAnalysis` receives all three data streams for the selected period:

```
Scheduled entries (existing format):
  2026-04-14 | morning | Енергія: 7, Настрій: 8

Events:
  2026-04-14 14:32 | Йога | —
  2026-04-14 16:10 | Дефекація | "трохи рідка"

Symptoms:
  2026-04-14 20:15 | Головний біль | "після роботи за комп'ютером"
```

AI can surface correlations: "Головний біль частіше у дні без Йоги", "Настрій вищий коли є фізична активність".

### Stats command (updated)

```
📊 Статистика за тиждень

Заплановані:
• Енергія: 7.2/10
• Настрій: 6.8/10

Симптоми (3 рази):
• Головний біль — 2
• Біль в спині — 1

Події (5 разів):
• Йога — 3
• Дефекація — 2
```

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `eventTypes`, `eventLogs` tables |
| `src/db/migrations/` | New migration for both tables |
| `src/db/repository.ts` | Add event CRUD + query functions |
| `src/bot/commands.ts` | Update keyboard, update `handleStats` |
| `src/bot/events.ts` | New file — log event/symptom conversation + management flow |
| `src/bot/index.ts` | Register new conversations and handlers |
| `src/ai/analyze.ts` | Include events/symptoms in prompt data |

---

## Out of Scope

- Editing event type names (only deactivate/delete for now)
- Per-event-type statistics (count only, no averages)
- Reminders for events/symptoms (always ad-hoc)
