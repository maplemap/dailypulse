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

const cancelKeyboard = new InlineKeyboard().text('❌ Скасувати', 'cancel_analysis');

const pendingAnalysis = new Map<number, AbortController>();

async function runAnalysis(ctx: Context, mode: 'brief' | 'detailed') {
  const chatId = ctx.chat!.id;

  if (pendingAnalysis.has(chatId)) {
    await ctx.reply('Аналіз вже виконується.');
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entries = await getEntriesByPeriod(weekAgo, now);

  if (entries.length === 0) {
    await ctx.reply('Немає записів за останній тиждень.');
    return;
  }

  const label = mode === 'brief' ? '🔍 Аналізую...' : '📋 Готую детальний звіт...';
  const msg = await ctx.reply(label, { reply_markup: cancelKeyboard });

  const controller = new AbortController();
  pendingAnalysis.set(chatId, controller);

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId.toString(), 'typing').catch(() => {});
  }, 4000);

  await ctx.api.sendChatAction(chatId.toString(), 'typing');

  try {
    const analysis = await generateAnalysis(entries, 'week', mode, controller.signal);
    await ctx.api.editMessageText(chatId, msg.message_id, analysis, {
      parse_mode: 'Markdown',
    });
  } catch {
    const text = controller.signal.aborted ? '❌ Аналіз скасовано.' : '⚠️ Не вдалося отримати аналіз.';
    await ctx.api.editMessageText(chatId, msg.message_id, text).catch(() => {});
  } finally {
    clearInterval(typingInterval);
    pendingAnalysis.delete(chatId);
  }
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
  bot.command('analyze', (ctx) => runAnalysis(ctx, 'brief'));
  bot.command('report', (ctx) => runAnalysis(ctx, 'detailed'));
  bot.command('stats', handleStats);

  bot.hears('✏️ Заповнити', (ctx) => ctx.conversation.enter('fill'));
  bot.hears('🔍 Аналіз', (ctx) => runAnalysis(ctx, 'brief'));
  bot.hears('📋 Детальний звіт', (ctx) => runAnalysis(ctx, 'detailed'));
  bot.hears('📊 Статистика', handleStats);

  bot.callbackQuery('cancel_analysis', async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat!.id;
    pendingAnalysis.get(chatId)?.abort();
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
