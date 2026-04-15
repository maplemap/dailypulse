import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from './types.js';
import {
  getAllItems,
  createItem,
  updateItem,
  archiveItem,
} from '../db/repository.js';

const PERIOD_LABELS: Record<string, string> = {
  morning: '🌅 Ранок',
  afternoon: '☀️ День',
  evening: '🌙 Вечір',
};

const TYPE_LABELS: Record<string, string> = {
  scale: 'шкала 1–10',
  boolean: 'так/ні',
  text: 'текст',
};

// ─── Menu builders ────────────────────────────────────────────────

async function buildItemsListKeyboard(showArchived = false) {
  const all = await getAllItems();
  const active = all.filter((i) => i.isActive);
  const archived = all.filter((i) => !i.isActive);

  const keyboard = new InlineKeyboard();

  for (const item of active) {
    const periods = (item.periods ?? []).map((p) => PERIOD_LABELS[p] ?? p).join(', ');
    keyboard
      .text(`${item.name} (${TYPE_LABELS[item.type] ?? item.type}) — ${periods}`, 'noop')
      .row()
      .text('✏️ Редагувати', `item_edit:${item.id}`)
      .text('📦 Архів', `item_archive_confirm:${item.id}`)
      .row();
  }

  keyboard.text('➕ Додати айтем', 'items_add').row();

  if (archived.length > 0) {
    if (showArchived) {
      keyboard.text('📦 Архівовані ▲', 'items_hide_archived').row();
      for (const item of archived) {
        keyboard.text(`${item.name} (архів)`, 'noop').row();
      }
    } else {
      keyboard.text(`📦 Архівовані (${archived.length}) ▼`, 'items_show_archived').row();
    }
  }

  return keyboard;
}

export async function sendItemsMenu(ctx: Context, showArchived = false) {
  const keyboard = await buildItemsListKeyboard(showArchived);
  await ctx.reply('⚙️ *Мої айтеми*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function editItemsMenu(ctx: Context, showArchived = false) {
  const keyboard = await buildItemsListKeyboard(showArchived);
  await ctx.editMessageText('⚙️ *Мої айтеми*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// ─── Add Item Conversation ────────────────────────────────────────

export async function addItemFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  await ctx.reply('Введи назву нового айтему:');
  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text.trim();

  const typeKeyboard = new InlineKeyboard()
    .text('📊 Шкала 1–10', 'type_scale')
    .text('✅ Так/Ні', 'type_boolean')
    .row()
    .text('📝 Текст', 'type_text');

  await ctx.reply('Виберіть тип:', { reply_markup: typeKeyboard });

  const typeCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (c) => c.answerCallbackQuery(),
  });
  await typeCtx.answerCallbackQuery();
  await typeCtx.editMessageReplyMarkup();

  const typeMap: Record<string, string> = {
    type_scale: 'scale',
    type_boolean: 'boolean',
    type_text: 'text',
  };
  const type = typeMap[typeCtx.callbackQuery.data] ?? 'scale';

  const selected = new Set(['morning', 'afternoon', 'evening']);

  function buildPeriodsKeyboard() {
    return new InlineKeyboard()
      .text(selected.has('morning') ? '✅ Ранок' : '⬜ Ранок', 'toggle_morning')
      .text(selected.has('afternoon') ? '✅ День' : '⬜ День', 'toggle_afternoon')
      .text(selected.has('evening') ? '✅ Вечір' : '⬜ Вечір', 'toggle_evening')
      .row()
      .text('Підтвердити ✅', 'periods_confirm');
  }

  const periodsMsg = await ctx.reply('Для яких часів доби?', {
    reply_markup: buildPeriodsKeyboard(),
  });

  while (true) {
    const toggleCtx = await conversation.waitFor('callback_query:data', {
      otherwise: (c) => c.answerCallbackQuery(),
    });

    const d = toggleCtx.callbackQuery.data;
    await toggleCtx.answerCallbackQuery();

    if (d === 'periods_confirm') {
      await toggleCtx.editMessageReplyMarkup();
      break;
    }

    if (d === 'toggle_morning') selected.has('morning') ? selected.delete('morning') : selected.add('morning');
    if (d === 'toggle_afternoon') selected.has('afternoon') ? selected.delete('afternoon') : selected.add('afternoon');
    if (d === 'toggle_evening') selected.has('evening') ? selected.delete('evening') : selected.add('evening');

    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, periodsMsg.message_id, {
      reply_markup: buildPeriodsKeyboard(),
    });
  }

  await conversation.external(() =>
    createItem({ name, type, periods: Array.from(selected), sortOrder: 0 }),
  );

  await ctx.reply(`✅ Айтем *${name}* додано!`, { parse_mode: 'Markdown' });
  await sendItemsMenu(ctx);
}

// ─── Edit Item Conversation ───────────────────────────────────────

export async function editItemFlow(
  conversation: Conversation<BotContext, BotContext>,
  ctx: BotContext,
) {
  const itemId = ctx.session.editingItemId;
  if (!itemId) {
    await ctx.reply('Помилка: айтем не вибрано.');
    return;
  }

  const allItems = await conversation.external(() => getAllItems());
  const item = allItems.find((i) => i.id === itemId);
  if (!item) {
    await ctx.reply('Айтем не знайдено.');
    return;
  }

  const editKeyboard = new InlineKeyboard()
    .text('✏️ Назву', 'edit_name')
    .text('🕐 Часи доби', 'edit_periods');

  await ctx.reply(`Що змінити у *${item.name}*?`, {
    parse_mode: 'Markdown',
    reply_markup: editKeyboard,
  });

  const choiceCtx = await conversation.waitFor('callback_query:data', {
    otherwise: (c) => c.answerCallbackQuery(),
  });
  await choiceCtx.answerCallbackQuery();
  await choiceCtx.editMessageReplyMarkup();

  if (choiceCtx.callbackQuery.data === 'edit_name') {
    await ctx.reply('Введи нову назву:');
    const nameCtx = await conversation.waitFor('message:text');
    const newName = nameCtx.message.text.trim();
    await conversation.external(() => updateItem(itemId, { name: newName }));
    await ctx.reply(`✅ Назву змінено на *${newName}*`, { parse_mode: 'Markdown' });
  } else {
    const selected = new Set(item.periods ?? ['morning', 'afternoon', 'evening']);

    function buildPeriodsKeyboard() {
      return new InlineKeyboard()
        .text(selected.has('morning') ? '✅ Ранок' : '⬜ Ранок', 'toggle_morning')
        .text(selected.has('afternoon') ? '✅ День' : '⬜ День', 'toggle_afternoon')
        .text(selected.has('evening') ? '✅ Вечір' : '⬜ Вечір', 'toggle_evening')
        .row()
        .text('Підтвердити ✅', 'periods_confirm');
    }

    const periodsMsg = await ctx.reply('Вибери часи доби:', {
      reply_markup: buildPeriodsKeyboard(),
    });

    while (true) {
      const toggleCtx = await conversation.waitFor('callback_query:data', {
        otherwise: (c) => c.answerCallbackQuery(),
      });

      const d = toggleCtx.callbackQuery.data;
      await toggleCtx.answerCallbackQuery();

      if (d === 'periods_confirm') {
        await toggleCtx.editMessageReplyMarkup();
        break;
      }

      if (d === 'toggle_morning') selected.has('morning') ? selected.delete('morning') : selected.add('morning');
      if (d === 'toggle_afternoon') selected.has('afternoon') ? selected.delete('afternoon') : selected.add('afternoon');
      if (d === 'toggle_evening') selected.has('evening') ? selected.delete('evening') : selected.add('evening');

      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, periodsMsg.message_id, {
        reply_markup: buildPeriodsKeyboard(),
      });
    }

    await conversation.external(() =>
      updateItem(itemId, { periods: Array.from(selected) }),
    );
    await ctx.reply('✅ Часи доби оновлено.');
  }

  await sendItemsMenu(ctx);
}

// ─── Register handlers ────────────────────────────────────────────

export function registerItemsMenu(bot: Bot<BotContext>) {
  bot.hears('⚙️ Айтеми', async (ctx) => sendItemsMenu(ctx));
  bot.command('items', async (ctx) => sendItemsMenu(ctx));

  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery('items_add', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('add_item');
  });

  bot.callbackQuery(/^item_edit:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.editingItemId = parseInt(ctx.match[1]);
    await ctx.conversation.enter('edit_item');
  });

  bot.callbackQuery(/^item_archive_confirm:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1]);
    const all = await getAllItems();
    const item = all.find((i) => i.id === id);
    if (!item) return;

    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Так, архівувати', `item_archive:${id}`)
      .text('❌ Скасувати', 'items_menu');

    await ctx.editMessageText(
      `📦 Архівувати *${item.name}*?\nАйтем зникне з форми, але всі дані збережуться.`,
      { parse_mode: 'Markdown', reply_markup: confirmKeyboard },
    );
  });

  bot.callbackQuery(/^item_archive:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1]);
    await archiveItem(id);
    await editItemsMenu(ctx);
  });

  bot.callbackQuery('items_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx);
  });

  bot.callbackQuery('items_show_archived', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx, true);
  });

  bot.callbackQuery('items_hide_archived', async (ctx) => {
    await ctx.answerCallbackQuery();
    await editItemsMenu(ctx, false);
  });
}
