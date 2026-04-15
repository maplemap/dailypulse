# DailyPulse

A Telegram bot for daily tracking of physical and mental well-being. Sends reminders three times a day, stores data in PostgreSQL, and analyzes it with Claude AI.

## Features

- **Reminders** — at 08:00, 13:00, and 20:00 with a "Fill in" button
- **Customizable check-in** — configurable tracked items (scale 1–10, yes/no, free text) per time of day
- **Events** — log ad-hoc events on demand (e.g. Yoga, walked the dog)
- **Symptoms** — log symptoms on demand (e.g. Headache, Back pain)
- **Journal** — free-text notes at any moment
- **AI analysis** — quick or detailed, on demand or automatically every Sunday at 20:00
- **Stats** — weekly averages for scale items + event/symptom counts

## Bot Keyboard

```
How I feel now  |  Event
Symptom         |  Note
     Analysis
```

**Analysis** shows weekly stats and two inline buttons:
- Quick analysis — brief AI summary
- Detailed analysis — full structured AI report

## Commands

| Command | Action |
|---|---|
| `/start` | Greeting and keyboard |
| `/fill` | Fill in a check-in manually |
| `/items` | Manage tracked items (add, edit, archive, delete) |
| `/analyze` | Quick AI analysis for the past week |
| `/report` | Detailed AI report for the past week |
| `/stats` | Brief statistics |

## Stack

- **Runtime:** Node.js + TypeScript
- **Telegram:** [grammy](https://grammy.dev/) + @grammyjs/conversations
- **DB:** PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/)
- **AI:** [Anthropic Claude](https://anthropic.com/) (`claude-sonnet-4-5`) with prompt caching
- **Scheduler:** node-cron
- **Deploy:** Docker Compose

## Quick Start

### 1. Clone and configure

```bash
git clone git@github.com:maplemap/dailypulse.git
cd dailypulse
cp .env.example .env
```

Fill in `.env`:

```env
BOT_TOKEN=          # token from @BotFather
DATABASE_URL=postgresql://healthbot:password@db:5432/healthbot
ANTHROPIC_API_KEY=  # key from console.anthropic.com
TELEGRAM_CHAT_ID=   # your chat_id (get it from @userinfobot)
DB_PASSWORD=        # password for PostgreSQL
TIMEZONE=           # e.g. Europe/Kyiv (default: Europe/Kyiv)
```

### 2. Run

```bash
make run    # dev mode with hot reload
make prod   # production in background
```

### All Make Commands

```
make help         Show this help
make run          Run dev mode (hot reload, source maps)
make prod         Run prod mode
make stop         Stop all containers
make logs         Follow logs
make db-generate  Generate database migrations
make db-migrate   Apply database migrations locally
```

## Project Structure

```
src/
├── bot/
│   ├── index.ts        <- grammy bot initialization
│   ├── commands.ts     <- keyboard, stats, analysis handlers
│   ├── flow.ts         <- check-in and journal conversation flows
│   ├── events.ts       <- event/symptom logging and management flows
│   ├── items-menu.ts   <- tracked items management menu
│   ├── errors.ts       <- user-friendly error messages
│   └── types.ts        <- BotContext types
├── scheduler/
│   └── index.ts        <- cron jobs (reminders + weekly report)
├── db/
│   ├── schema.ts       <- all table schemas
│   ├── index.ts        <- PostgreSQL connection
│   ├── repository.ts   <- data access functions
│   ├── seed.ts         <- default tracking items seeder
│   └── migrations/     <- SQL migrations (auto-generated)
├── ai/
│   └── analyze.ts      <- prompts and Claude API calls
├── config.ts           <- env variables with validation
└── index.ts            <- entry point, auto-migration on startup
```

## Database Schema

```sql
tracking_items  (id, name, type, periods[], sort_order, is_active, archived_at, created_at)
entries         (id, recorded_at, period)
entry_values    (id, entry_id->entries, item_id->tracking_items, value)

event_types     (id, name, category, is_active, created_at)  -- 'event' | 'symptom'
event_logs      (id, event_type_id->event_types, recorded_at, comment)

journal_entries (id, text, recorded_at)
```

Migrations apply automatically on startup.

## Deploy on Ubuntu Server

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone the repo and configure .env
git clone <repo> && cd dailypulse
cp .env.example .env && nano .env

# Start
make prod

# Check logs
make logs
```

## Roadmap

- [ ] Apple Health integration (sleep, activity via iPhone)
- [ ] Advanced analytics: correlations between metrics, events and symptoms
- [ ] Weekly/monthly charts
