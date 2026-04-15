# Custom Tracking Items — Design Spec

**Date:** 2026-04-14
**Status:** Approved

## Context

Currently DailyPulse tracks three fixed fields per entry: energy, mood, anxiety. The goal is to make tracking fully customizable — users create their own items with a chosen type (scale, boolean, text), assign them to specific time periods, and can archive them when no longer needed. This lays the foundation for future analytics, graphs, and medical documentation integration.

---

## 1. Database Schema

### New table: `tracking_items`

```sql
id          SERIAL PRIMARY KEY
name        VARCHAR(100) NOT NULL          -- e.g. "Енергія", "Головний біль"
type        VARCHAR(10)  NOT NULL          -- 'scale' | 'boolean' | 'text'
periods     VARCHAR(10)[] NOT NULL DEFAULT ARRAY['morning','afternoon','evening']
sort_order  SMALLINT NOT NULL DEFAULT 0   -- display order in the fill form
is_active   BOOLEAN NOT NULL DEFAULT true
archived_at TIMESTAMPTZ                    -- NULL = active
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Modified table: `entries`

Remove fixed columns `energy`, `mood`, `anxiety`. Keep only:

```sql
id          SERIAL PRIMARY KEY
recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
period      VARCHAR(10)  NOT NULL   -- 'morning' | 'afternoon' | 'evening'
```

### New table: `entry_values`

```sql
id       SERIAL PRIMARY KEY
entry_id INTEGER NOT NULL REFERENCES entries(id)
item_id  INTEGER NOT NULL REFERENCES tracking_items(id)
value    TEXT NOT NULL   -- "7" for scale, "true"/"false" for boolean, free text for text
```

### Seed data

On first run, insert default items:

| name | type | periods |
|---|---|---|
| Енергія | scale | all |
| Настрій | scale | all |
| Тривожність | scale | all |

Seed runs only if `tracking_items` table is empty.

### Migrations

Two migrations needed:
1. Create `tracking_items` and `entry_values`, insert seed data
2. Drop `energy`, `mood`, `anxiety` columns from `entries`

---

## 2. Item Management — Inline Menu

New button added to `mainKeyboard`: **⚙️ Айтеми**

### Menu structure

```
⚙️ Мої айтеми
  ├── Енергія (шкала, всі)       [✏️] [📦]
  ├── Настрій (шкала, всі)       [✏️] [📦]
  ├── Тривожність (шкала, всі)   [✏️] [📦]
  └── [➕ Додати айтем]

  📦 Архівовані [розгорнути]
```

### Add item flow

```
1. Введи назву → text input
2. Тип?  → [📊 Шкала 1–10]  [✅ Так/Ні]  [📝 Текст]
3. Коли? → [🕐 Всі]  [🌅 Ранок]  [☀️ День]  [🌙 Вечір]
           (multiple selection, confirm with ✅)
4. ✅ Збережено!
```

### Edit item

Only `name` and `periods` are editable. `type` cannot be changed — it would corrupt historical data.

### Archive item

Requires confirmation:

```
📦 Архівувати "Головний біль"?
Айтем зникне з форми, але всі дані збережуться.

[✅ Так, архівувати]  [❌ Скасувати]
```

---

## 3. Dynamic Fill Flow

`fillFlow` becomes fully dynamic:

1. Determine current `period` (morning / afternoon / evening)
2. Query active `tracking_items` for this period, ordered by `sort_order`
3. If no active items for period → notify user and suggest configuring items
4. For each item, show appropriate UI:
   - **scale** → inline buttons 1–10 (two rows: 1–5, 6–10)
   - **boolean** → `[✅ Так]  [❌ Ні]`
   - **text** → free text input or `/skip`
5. Save one `entries` row + one `entry_values` row per item

---

## 4. AI Analysis

System prompt description of fields becomes dynamic, built from active `tracking_items`:

```
Кожен запис містить:
- Енергія (шкала 1–10): значення від 1 до 10
- Головний біль (так/ні): true або false
- Нотатки (текст): довільний коментар
```

`entry_values` are joined with `tracking_items` before being passed to Claude, so the AI always receives named, typed values — not raw data.

---

## 5. Error Handling

- If `tracking_items` seed fails on startup → log error, bot continues (non-fatal)
- If item deleted while fill in progress → skip missing item, complete entry with available values
- Archive confirmation uses inline keyboard with timeout: if no response in 60 seconds, treat as cancelled

---

## Future Considerations (out of scope for this spec)

- Per-item graphs and analytics
- Search across historical entries by item
- Medical documentation integration with diagnoses
- Multi-user support (item sets per user)
- Weather service integration — correlate weather conditions and seasons with physical/mental state
- Apple Health integration — import activity, heart rate, steps, and other metrics from the iPhone Health app to enrich entries and analysis
