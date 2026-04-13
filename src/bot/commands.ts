import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from './types.js';
import { getEntriesByPeriod, getStats } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

export function registerCommands(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `Привіт! Я буду нагадувати тобі тричі на день описати свій стан.\n\n` +
        `Команди:\n` +
        `/fill — заповнити запис зараз\n` +
        `/analyze — AI-аналіз за тиждень\n` +
        `/stats — коротка статистика`,
    );
  });

  bot.command('fill', async (ctx) => {
    await ctx.conversation.enter('fill');
  });

  bot.command('analyze', async (ctx) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const entries = await getEntriesByPeriod(weekAgo, now);

    if (entries.length === 0) {
      await ctx.reply('Немає записів за останній тиждень.');
      return;
    }

    await ctx.reply('Аналізую... це може зайняти кілька секунд.');
    const analysis = await generateAnalysis(entries, 'week');
    await ctx.reply(analysis, { parse_mode: 'Markdown' });
  });

  bot.command('stats', async (ctx) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stats = await getStats(weekAgo, now);

    if (!stats.avgEnergy) {
      await ctx.reply('Немає записів за останній тиждень.');
      return;
    }

    const fmt = (v: unknown) => (v ? Number(v).toFixed(1) : '—');

    await ctx.reply(
      `📊 *Статистика за тиждень*\n\n` +
        `⚡ Енергія: ${fmt(stats.avgEnergy)}/10\n` +
        `😊 Настрій: ${fmt(stats.avgMood)}/10\n` +
        `😰 Тривожність: ${fmt(stats.avgAnxiety)}/10\n` +
        `🏃 Активність: ${fmt(stats.avgActivity)}/10`,
      { parse_mode: 'Markdown' },
    );
  });

  // Handle "Fill in" button from reminders
  bot.callbackQuery('reminder_fill', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('fill');
  });
}

export function buildReminderKeyboard() {
  return new InlineKeyboard().text('Заповнити', 'reminder_fill');
}
