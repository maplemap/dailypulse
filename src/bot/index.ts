import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { friendlyError } from './errors.js';
import { registerCommands, mainKeyboard } from './commands.js';
import { registerItemsMenu, addItemFlow, editItemFlow } from './items-menu.js';
import { fillFlow } from './flow.js';
import { logEventFlow, logSymptomFlow } from './events.js';
import type { BotContext, SessionData } from './types.js';

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(
    session({
      initial: (): SessionData => ({}),
    }),
  );
  bot.use(conversations<BotContext, BotContext>());
  bot.use(createConversation<BotContext, BotContext>(fillFlow, 'fill'));
  bot.use(createConversation<BotContext, BotContext>(addItemFlow, 'add_item'));
  bot.use(createConversation<BotContext, BotContext>(editItemFlow, 'edit_item'));
  bot.use(createConversation<BotContext, BotContext>(logEventFlow, 'log_event'));
  bot.use(createConversation<BotContext, BotContext>(logSymptomFlow, 'log_symptom'));

  bot.use(async (ctx, next) => {
    if (ctx.chat?.id.toString() !== config.telegramChatId) return;
    await next();
  });

  registerCommands(bot);
  registerItemsMenu(bot);

  bot.hears('⚡ Подія', (ctx) => ctx.conversation.enter('log_event'));
  bot.hears('🤒 Симптом', (ctx) => ctx.conversation.enter('log_symptom'));

  bot.on('message', async (ctx) => {
    await ctx.reply('Обери дію:', { reply_markup: mainKeyboard });
  });

  bot.catch(async (err) => {
    console.error('Bot error:', err);

    const text = friendlyError(err.error);

    try {
      if (err.ctx) {
        await err.ctx.reply(text, { parse_mode: 'Markdown' });
      } else {
        await bot.api.sendMessage(config.telegramChatId, text, { parse_mode: 'Markdown' });
      }
    } catch {
      // ignore send failure
    }
  });

  return bot;
}
