import { InlineKeyboard } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from './types.js';
import { mainKeyboard } from './commands.js';
import {
  getActiveEventTypes,
  getAllEventTypes,
  createEventType,
  createEventLog,
  updateEventLogComment,
  deactivateEventType,
  deleteEventType,
} from '../db/repository.js';

type Category = 'event' | 'symptom';

const LABELS: Record<Category, string> = {
  event: '⚡ Подія',
  symptom: '🤒 Симптом',
};

async function buildTypeKeyboard(category: Category) {
  const types = await getActiveEventTypes(category);
  const keyboard = new InlineKeyboard();
  for (const t of types) {
    keyboard.text(t.name, `logtype_${t.id}`).row();
  }
  keyboard
    .text('➕ Новий', 'lognew')
    .text('⚙️ Керувати', 'logmanage')
    .row()
    .text('❌ Скасувати', 'logcancel');
  return keyboard;
}

async function handleManagement(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  category: Category,
) {
  while (true) {
    const types = await conversation.external(() => getAllEventTypes(category));

    const keyboard = new InlineKeyboard();
    for (const t of types) {
      keyboard.text(`${t.isActive ? '✅' : '📦'} ${t.name}`, 'noop').row();
      if (t.isActive) {
        keyboard.text('📦 Деактивувати', `mgmt_deact_${t.id}`);
      }
      keyboard.text('🗑️ Видалити', `mgmt_del_${t.id}`).row();
    }
    keyboard.text('← Назад', 'mgmt_back');

    const msg = await ctx.reply('⚙️ Керування:', { reply_markup: keyboard });

    const cbCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    const data = cbCtx.callbackQuery.data;
    await cbCtx.answerCallbackQuery();
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id);

    if (data === 'mgmt_back') return;
    if (data === 'noop') continue;

    if (data.startsWith('mgmt_deact_')) {
      const id = parseInt(data.replace('mgmt_deact_', ''));
      await conversation.external(() => deactivateEventType(id));
      continue;
    }

    if (data.startsWith('mgmt_del_')) {
      const id = parseInt(data.replace('mgmt_del_', ''));
      const confirmKeyboard = new InlineKeyboard()
        .text('✅ Так, видалити', `mgmt_delconf_${id}`)
        .text('❌ Скасувати', 'mgmt_delcancel');

      const confirmMsg = await ctx.reply('🗑️ Видалити разом з усіма логами?', {
        reply_markup: confirmKeyboard,
      });

      const confirmCtx = await conversation.waitFor('callback_query:data', {
        otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
      });
      const confirmData = confirmCtx.callbackQuery.data;
      await confirmCtx.answerCallbackQuery();
      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, confirmMsg.message_id);

      if (confirmData.startsWith('mgmt_delconf_')) {
        const deleteId = parseInt(confirmData.replace('mgmt_delconf_', ''));
        await conversation.external(() => deleteEventType(deleteId));
      }
      continue;
    }
  }
}

async function logFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
  category: Category,
) {
  while (true) {
    const keyboard = await conversation.external(() => buildTypeKeyboard(category));
    const msg = await ctx.reply(`${LABELS[category]} — вибери або додай:`, {
      reply_markup: keyboard,
    });

    const cbCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    const data = cbCtx.callbackQuery.data;
    await cbCtx.answerCallbackQuery();
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, msg.message_id);

    if (data === 'logcancel') return;

    if (data === 'logmanage') {
      await handleManagement(conversation, ctx, category);
      continue;
    }

    let eventTypeId: number;

    if (data === 'lognew') {
      await ctx.reply('Введи назву:');
      const nameCtx = await conversation.waitFor('message:text', {
        otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
      });
      const name = nameCtx.message.text.trim();
      const newType = await conversation.external(() => createEventType(name, category));
      eventTypeId = newType.id;
    } else if (data.startsWith('logtype_')) {
      eventTypeId = parseInt(data.replace('logtype_', ''));
    } else {
      continue;
    }

    const logId = await conversation.external(() => createEventLog(eventTypeId));
    await ctx.reply('✅ Записано!');

    const commentKeyboard = new InlineKeyboard()
      .text('✍️ Коментар', 'addcomment')
      .text('➡️ Пропустити', 'skipcomment');
    const commentMsg = await ctx.reply('Додати коментар?', { reply_markup: commentKeyboard });

    const commentCb = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
    });
    await commentCb.answerCallbackQuery();
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, commentMsg.message_id);

    if (commentCb.callbackQuery.data === 'addcomment') {
      await ctx.reply('Введи коментар:');
      const textCtx = await conversation.waitFor('message:text', {
        otherwise: (c) => { if (c.callbackQuery) c.answerCallbackQuery().catch(() => {}); },
      });
      const comment = textCtx.message.text.trim();
      if (comment) await conversation.external(() => updateEventLogComment(logId, comment));
      await ctx.reply('✅ Коментар збережено.', { reply_markup: mainKeyboard });
    } else {
      await ctx.reply('Дія записана.', { reply_markup: mainKeyboard });
    }

    return;
  }
}

export async function logEventFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await logFlow(conversation, ctx, 'event');
}

export async function logSymptomFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await logFlow(conversation, ctx, 'symptom');
}
