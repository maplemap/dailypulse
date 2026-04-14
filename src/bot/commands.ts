import type { Bot, Context } from 'grammy';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from './types.js';
import { getEntriesByPeriod, getStats } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

export const mainKeyboard = new Keyboard()
  .text('✏️ Заповнити').text('📊 Статистика').row()
  .text('🔍 Аналіз').text('📋 Детальний звіт')
  .resized()
  .persistent();

async function handleAnalyze(ctx: Context) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entries = await getEntriesByPeriod(weekAgo, now);

  if (entries.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  await ctx.reply('Аналізую...');
  const analysis = await generateAnalysis(entries, 'week', 'brief');
  await ctx.reply(analysis, { parse_mode: 'Markdown' });
}

async function handleReport(ctx: Context) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entries = await getEntriesByPeriod(weekAgo, now);

  if (entries.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  await ctx.reply('Готую детальний звіт... це може зайняти кілька секунд.');
  const analysis = await generateAnalysis(entries, 'week', 'detailed');
  await ctx.reply(analysis, { parse_mode: 'Markdown' });
}

async function handleStats(ctx: Context) {
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
      `😰 Тривожність: ${fmt(stats.avgAnxiety)}/10`,
    { parse_mode: 'Markdown' },
  );
}

export function registerCommands(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `Привіт! Я буду нагадувати тобі тричі на день описати свій стан.`,
      { reply_markup: mainKeyboard },
    );
  });

  bot.command('fill', (ctx) => ctx.conversation.enter('fill'));
  bot.command('analyze', handleAnalyze);
  bot.command('report', handleReport);
  bot.command('stats', handleStats);

  bot.hears('✏️ Заповнити', (ctx) => ctx.conversation.enter('fill'));
  bot.hears('🔍 Аналіз', handleAnalyze);
  bot.hears('📋 Детальний звіт', handleReport);
  bot.hears('📊 Статистика', handleStats);

  // Handle "Fill in" button from reminders
  bot.callbackQuery('reminder_fill', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('fill');
  });
}

export function buildReminderKeyboard() {
  return new InlineKeyboard().text('Заповнити', 'reminder_fill');
}
