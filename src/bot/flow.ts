import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from './types.js';
import { createEntry, createJournalEntry, getActiveItems } from '../db/repository.js';
import { mainKeyboard } from './commands.js';

type Period = 'morning' | 'afternoon' | 'evening';

function getCurrentPeriod(): Period {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function buildScoreKeyboard() {
  const keyboard = new InlineKeyboard();
  for (let i = 1; i <= 5; i++) keyboard.text(String(i), `score_${i}`);
  keyboard.row();
  for (let i = 6; i <= 10; i++) keyboard.text(String(i), `score_${i}`);
  return keyboard;
}

const booleanKeyboard = new InlineKeyboard()
  .text('✅ Так', 'bool_true')
  .text('❌ Ні', 'bool_false');

async function askScore(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string> {
  await ctx.reply(question, { reply_markup: buildScoreKeyboard(), parse_mode: 'Markdown' });

  const callbackCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (ctx) => { if (ctx.callbackQuery) ctx.answerCallbackQuery().catch(() => {}); },
  });

  const data = callbackCtx.callbackQuery.data;

  if (!data.startsWith('score_')) {
    await callbackCtx.answerCallbackQuery();
    return askScore(conversation, ctx, question);
  }

  await callbackCtx.answerCallbackQuery();
  await callbackCtx.editMessageReplyMarkup();
  return data.replace('score_', '');
}

async function askBoolean(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string> {
  await ctx.reply(question, { reply_markup: booleanKeyboard, parse_mode: 'Markdown' });

  const callbackCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (ctx) => { if (ctx.callbackQuery) ctx.answerCallbackQuery().catch(() => {}); },
  });

  const data = callbackCtx.callbackQuery.data;

  if (data !== 'bool_true' && data !== 'bool_false') {
    await callbackCtx.answerCallbackQuery();
    return askBoolean(conversation, ctx, question);
  }

  await callbackCtx.answerCallbackQuery();
  await callbackCtx.editMessageReplyMarkup();
  return data === 'bool_true' ? 'true' : 'false';
}

async function askText(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<string | null> {
  await ctx.reply(question, { parse_mode: 'Markdown' });

  const msgCtx = await conversation.waitFor('message:text');
  const text = msgCtx.message.text;
  return text === '/skip' ? null : text;
}

export async function fillFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const period = getCurrentPeriod();
  const items = await conversation.external(() => getActiveItems(period));

  if (items.length === 0) {
    await ctx.reply(
      'Немає активних айтемів для цього часу. Налаштуй їх через *⚙️ Айтеми*.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  await ctx.reply('Починаємо опитування:', { reply_markup: { remove_keyboard: true } });

  const values: { itemId: number; value: string }[] = [];

  for (const item of items) {
    let value: string | null;

    if (item.type === 'scale') {
      value = await askScore(conversation, ctx, `*${item.name}* — оціни від 1 до 10`);
    } else if (item.type === 'boolean') {
      value = await askBoolean(conversation, ctx, `*${item.name}*`);
    } else {
      value = await askText(conversation, ctx, `*${item.name}* — напиши або /skip`);
    }

    if (value !== null) {
      values.push({ itemId: item.id, value });
    }
  }

  await conversation.external(() => createEntry(period, values));
  await ctx.reply('✅ Записано! Дякую.\n\n_Змінити список показників: /items_', {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard,
  });
}

export async function journalFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await ctx.reply('📝 Напиши свою нотатку:');
  const msgCtx = await conversation.waitFor('message:text');
  const text = msgCtx.message.text.trim();
  await conversation.external(() => createJournalEntry(text));
  await ctx.reply('✅ Нотатку збережено.', { reply_markup: mainKeyboard });
}
