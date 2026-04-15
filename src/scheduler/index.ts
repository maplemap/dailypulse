import cron from 'node-cron';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/types.js';
import { buildReminderKeyboard } from '../bot/commands.js';
import { config } from '../config.js';
import { getEntriesWithValues, getEventLogsWithTypes, getJournalEntries } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

const CHAT_ID = config.telegramChatId;

const TIMEZONE = config.timezone;

async function sendReminder(bot: Bot<BotContext>, text: string) {
  console.log(`[scheduler] Sending reminder: ${text.slice(0, 30)}...`);
  try {
    await bot.api.sendMessage(CHAT_ID, text, {
      reply_markup: buildReminderKeyboard(),
    });
  } catch (err) {
    console.error('[scheduler] Failed to send reminder:', err);
  }
}

export function startScheduler(bot: Bot<BotContext>) {
  // Morning reminder — 08:00
  cron.schedule('0 8 * * *', () => {
    sendReminder(bot, '🌅 Доброго ранку! Як ти почуваєшся?');
  }, { timezone: TIMEZONE });

  // Afternoon reminder — 13:00
  cron.schedule('0 13 * * *', () => {
    sendReminder(bot, '☀️ Середина дня! Як справи?');
  }, { timezone: TIMEZONE });

  // Evening reminder — 20:00
  cron.schedule('0 20 * * *', () => {
    sendReminder(bot, '🌙 Добрий вечір! Підсумуємо день?');
  }, { timezone: TIMEZONE });

  // Weekly AI report — every Sunday at 20:00
  cron.schedule('0 20 * * 0', async () => {
    console.log('[scheduler] Running weekly AI report...');
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const [rows, eventRows, journalRows] = await Promise.all([
        getEntriesWithValues(weekAgo, now),
        getEventLogsWithTypes(weekAgo, now),
        getJournalEntries(weekAgo, now),
      ]);

      if (rows.length === 0 && eventRows.length === 0 && journalRows.length === 0) {
        await bot.api.sendMessage(
          CHAT_ID,
          '📊 Цього тижня немає записів для аналізу.',
        );
        return;
      }

      await bot.api.sendMessage(CHAT_ID, '📊 Готую тижневий AI-звіт...');
      const analysis = await generateAnalysis(rows, 'week', 'detailed', undefined, eventRows, journalRows);
      await bot.api.sendMessage(CHAT_ID, analysis, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[scheduler] Weekly report failed:', err);
    }
  }, { timezone: TIMEZONE });

  console.log(`Scheduler started (timezone: ${TIMEZONE})`);
}
