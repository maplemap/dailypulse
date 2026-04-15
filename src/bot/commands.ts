import type { Bot, Context } from 'grammy';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from './types.js';
import { getEntriesWithValues, getStats, getEventLogsWithTypes, getEventStats, getJournalEntries } from '../db/repository.js';
import { generateAnalysis } from '../ai/analyze.js';

export const mainKeyboard = new Keyboard()
  .text('🌡️ Як я зараз').text('⚡ Подія').row()
  .text('🤒 Симптом').text('📝 Нотатка').row()
  .text('📊 Аналіз')
  .resized()
  .persistent();

const cancelKeyboard = new InlineKeyboard().text('❌ Скасувати', 'cancel_analysis');

const analysisKeyboard = new InlineKeyboard()
  .text('🔍 Швидкий аналіз', 'analysis_brief')
  .text('📋 Детальний аналіз', 'analysis_detailed');

const pendingAnalysis = new Map<number, AbortController>();

async function runAnalysis(ctx: Context, mode: 'brief' | 'detailed') {
  const chatId = ctx.chat!.id;

  if (pendingAnalysis.has(chatId)) {
    await ctx.reply('Аналіз вже виконується.');
    return;
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [rows, eventRows, journalRows] = await Promise.all([
    getEntriesWithValues(weekAgo, now),
    getEventLogsWithTypes(weekAgo, now),
    getJournalEntries(weekAgo, now),
  ]);

  if (rows.length === 0 && eventRows.length === 0 && journalRows.length === 0) {
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
    const analysis = await generateAnalysis(rows, 'week', mode, controller.signal, eventRows, journalRows);
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

  const [rows, eventRows] = await Promise.all([
    getStats(weekAgo, now),
    getEventStats(weekAgo, now),
  ]);

  const parts: string[] = ['📊 *Статистика за тиждень*'];

  if (rows.length > 0) {
    const fmt = (v: string | null) => (v ? Number(v).toFixed(1) : '—');
    parts.push('*Заплановані:*\n' + rows.map((r) => `• ${r.itemName}: ${fmt(r.avg)}/10`).join('\n'));
  }

  const symptoms = eventRows.filter((r) => r.category === 'symptom');
  const events = eventRows.filter((r) => r.category === 'event');

  if (symptoms.length > 0) {
    const total = symptoms.reduce((s, r) => s + Number(r.count), 0);
    parts.push(
      `*Симптоми (${total} разів):*\n` +
        symptoms.map((r) => `• ${r.name} — ${r.count}`).join('\n'),
    );
  }

  if (events.length > 0) {
    const total = events.reduce((s, r) => s + Number(r.count), 0);
    parts.push(
      `*Події (${total} разів):*\n` +
        events.map((r) => `• ${r.name} — ${r.count}`).join('\n'),
    );
  }

  const text = parts.length > 1 ? parts.join('\n\n') : '📊 *Статистика за тиждень*\n\nЗаписів ще немає.';

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: analysisKeyboard,
  });
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

  bot.hears('🌡️ Як я зараз', (ctx) => ctx.conversation.enter('fill'));
  bot.hears('📝 Нотатка', (ctx) => ctx.conversation.enter('journal'));
  bot.hears('📊 Аналіз', handleStats);

  bot.callbackQuery('analysis_brief', async (ctx) => {
    await ctx.answerCallbackQuery();
    await runAnalysis(ctx, 'brief');
  });

  bot.callbackQuery('analysis_detailed', async (ctx) => {
    await ctx.answerCallbackQuery();
    await runAnalysis(ctx, 'detailed');
  });

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
