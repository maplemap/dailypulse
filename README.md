# DailyPulse

A Telegram bot for daily tracking of physical and mental well-being. Sends reminders three times a day to fill in a short journal, stores data in PostgreSQL, and analyzes it with Claude AI.

## Features

- **Reminders** — at 08:00, 13:00, and 20:00 with a "Fill in" button
- **Well-being journal** — inline buttons from 1 to 10 for 4 metrics + optional comment
- **AI analysis** — on demand (`/analyze`) or automatically every Sunday at 20:00
- **Stats** — weekly averages (`/stats`)

## Metrics

| Metric | Scale |
|---|---|
| ⚡ Energy | 1–10 |
| 😊 Mood | 1–10 |
| 😰 Anxiety | 1–10 (higher = more anxious) |
| 🏃 Physical activity | 1–10 |

## Commands

| Command | Action |
|---|---|
| `/start` | Greeting and instructions |
| `/fill` | Fill in an entry manually |
| `/analyze` | AI analysis for the past week |
| `/stats` | Brief statistics |

## Stack

- **Runtime:** Node.js + TypeScript
- **Telegram:** [grammy](https://grammy.dev/) + @grammyjs/conversations
- **DB:** PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/)
- **AI:** [Anthropic Claude](https://anthropic.com/) (`claude-opus-4-6`) with prompt caching
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
│   ├── index.ts        ← grammy bot initialization
│   ├── commands.ts     ← command and callback button handlers
│   ├── flow.ts         ← entry fill-in conversation flow
│   └── types.ts        ← BotContext types
├── scheduler/
│   └── index.ts        ← cron jobs (reminders + weekly report)
├── db/
│   ├── schema.ts       ← entries table schema
│   ├── index.ts        ← PostgreSQL connection
│   ├── repository.ts   ← data access functions
│   └── migrations/     ← SQL migrations (auto-generated)
├── ai/
│   └── analyze.ts      ← prompts and Claude API calls
├── config.ts           ← env variables with validation
└── index.ts            ← entry point, auto-migration on startup
```

## Database Schema

```sql
entries (
  id          SERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period      VARCHAR(10) NOT NULL,  -- morning | afternoon | evening
  energy      SMALLINT NOT NULL,     -- 1-10
  mood        SMALLINT NOT NULL,     -- 1-10
  anxiety     SMALLINT NOT NULL,     -- 1-10
  activity    SMALLINT NOT NULL,     -- 1-10
  comment     TEXT                   -- nullable
)
```

## Deploy on Ubuntu Server

```bash
# Install Docker and Docker Compose
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

- [ ] Apple Health integration (sleep quality via iPhone)
- [ ] Advanced analytics: correlations between metrics
- [ ] Weekly/monthly charts
