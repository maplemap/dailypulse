import cron from 'node-cron';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/types.js';
import { buildReminderKeyboard } from '../bot/commands.js';
import { config } from '../config.js';
import { getEntriesByPeriod } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

const CHAT_ID = config.telegramChatId;

export function startScheduler(bot: Bot<BotContext>) {
  // Morning reminder — 08:00
  cron.schedule('0 8 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '🌅 Доброго ранку! Як ти почуваєшся?', {
      reply_markup: buildReminderKeyboard(),
    });
  });

  // Afternoon reminder — 13:00
  cron.schedule('0 13 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '☀️ Середина дня! Як справи?', {
      reply_markup: buildReminderKeyboard(),
    });
  });

  // Evening reminder — 20:00
  cron.schedule('0 20 * * *', async () => {
    await bot.api.sendMessage(CHAT_ID, '🌙 Добрий вечір! Підсумуємо день?', {
      reply_markup: buildReminderKeyboard(),
    });
  });

  // Weekly AI report — every Sunday at 20:00
  cron.schedule('0 20 * * 0', async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const entries = await getEntriesByPeriod(weekAgo, now);

    if (entries.length === 0) {
      await bot.api.sendMessage(
        CHAT_ID,
        '📊 Цього тижня немає записів для аналізу.',
      );
      return;
    }

    await bot.api.sendMessage(CHAT_ID, '📊 Готую тижневий AI-звіт...');
    const analysis = await generateAnalysis(entries, 'week');
    await bot.api.sendMessage(CHAT_ID, analysis, { parse_mode: 'Markdown' });
  });

  console.log('Scheduler started');
}
