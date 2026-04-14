import type { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from './types.js';
import { createEntry } from '../db/repository.js';

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

async function askScore(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  question: string,
): Promise<number> {
  await ctx.reply(question, { reply_markup: buildScoreKeyboard() });

  const callbackCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (ctx) => ctx.answerCallbackQuery(),
  });

  const data = callbackCtx.callbackQuery.data;

  if (!data.startsWith('score_')) {
    await callbackCtx.answerCallbackQuery();
    return askScore(conversation, ctx, question);
  }

  await callbackCtx.answerCallbackQuery();
  const score = parseInt(data.replace('score_', ''), 10);
  await callbackCtx.editMessageReplyMarkup();
  return score;
}

export async function fillFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const energy = await askScore(
    conversation,
    ctx,
    '⚡ *Енергія* — як твій рівень енергії зараз? (1–10)',
  );
  const mood = await askScore(
    conversation,
    ctx,
    '😊 *Настрій* — як ти себе почуваєш емоційно? (1–10)',
  );
  const anxiety = await askScore(
    conversation,
    ctx,
    '😰 *Тривожність* — наскільки ти тривожишся або відчуваєш стрес? (1–10)',
  );
  await ctx.reply('📝 Хочеш додати коментар? Напиши текст або /skip');

  const commentCtx = await conversation.waitFor('message:text');
  const commentText = commentCtx.message.text;
  const comment = commentText === '/skip' ? null : commentText;

  const period = getCurrentPeriod();

  await createEntry({
    period,
    energy,
    mood,
    anxiety,
    comment,
  });

  await commentCtx.reply('✅ Записано! Дякую.');
}
