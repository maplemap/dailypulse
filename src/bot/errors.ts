export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('credit balance is too low')) {
    return '⚠️ Закінчились кредити Anthropic API. Поповни баланс на [console.anthropic.com](https://console.anthropic.com) → Plans & Billing.';
  }

  if (message.includes('401') || message.includes('invalid_api_key') || message.includes('Unauthorized')) {
    return '⚠️ Невірний API-ключ. Перевір `ANTHROPIC_API_KEY` або `BOT_TOKEN` у `.env`.';
  }

  if (message.includes('529') || message.includes('overloaded')) {
    return '⚠️ Anthropic API перевантажений. Спробуй ще раз за кілька хвилин.';
  }

  if (message.includes('rate_limit') || message.includes('429')) {
    return '⚠️ Перевищено ліміт запитів до Anthropic API. Спробуй пізніше.';
  }

  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('network')) {
    return '⚠️ Немає зʼєднання з інтернетом або сервіс недоступний. Перевір мережу.';
  }

  if (message.includes('database') || message.includes('postgres') || message.includes('relation')) {
    return '⚠️ Помилка бази даних. Перевір логи: `make logs`.';
  }

  return `⚠️ Щось пішло не так. Перевір логи: \`make logs\`\n\n\`${message.slice(0, 300)}\``;
}
