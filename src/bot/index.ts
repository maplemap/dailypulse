import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../config.js';
import { registerCommands } from './commands.js';
import { fillFlow } from './flow.js';
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

  registerCommands(bot);

  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  return bot;
}
