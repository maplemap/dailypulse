import cron from 'node-cron';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/types.js';
import { buildReminderKeyboard } from '../bot/commands.js';
import { config } from '../config.js';
import { getEntriesWithValues, getEventLogsWithTypes } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

const CHAT_ID = config.telegramChatId;

const TIMEZONE = config.timezone;

export function startScheduler(bot: Bot<BotContext>) {
  // Morning reminder — 08:00
  cron.schedule('0 8 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '🌅 Доброго ранку! Як ти почуваєшся?', {
      reply_markup: buildReminderKeyboard(),
    });
  }, { timezone: TIMEZONE });

  // Afternoon reminder — 13:00
  cron.schedule('0 13 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '☀️ Середина дня! Як справи?', {
      reply_markup: buildReminderKeyboard(),
    });
  }, { timezone: TIMEZONE });

  // Evening reminder — 20:00
  cron.schedule('0 20 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '🌙 Добрий вечір! Підсумуємо день?', {
      reply_markup: buildReminderKeyboard(),
    });
  }, { timezone: TIMEZONE });

  // Weekly AI report — every Sunday at 20:00
  cron.schedule('0 20 * * 0', async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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
    await bot.api.sendMessage(CHAT_ID, analysis, { parse_mode: 'Markdown' });
  }, { timezone: TIMEZONE });

  console.log(`Scheduler started (timezone: ${TIMEZONE})`);
}
