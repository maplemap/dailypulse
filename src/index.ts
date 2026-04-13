import 'dotenv/config';
import { createBot } from './bot/index.js';
import { startScheduler } from './scheduler/index.js';
import { db } from './db/index.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('Starting DailyPulse...');

  // Run migrations
  await migrate(db, {
    migrationsFolder: join(__dirname, 'db', 'migrations'),
  });
  console.log('Migrations applied');

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
