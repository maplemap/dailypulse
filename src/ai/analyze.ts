import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { Entry } from '../db/schema.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Ти — персональний AI-асистент для аналізу здоров'я та самопочуття.
Ти аналізуєш щоденні записи користувача про фізичний і ментальний стан.

Кожен запис містить оцінки від 1 до 10:
- Енергія: загальний рівень енергії
- Настрій: емоційний стан
- Тривожність: рівень тривоги (чим вище — тим більше тривоги)

Твоє завдання — надати корисний, підтримуючий та конструктивний аналіз.
Пиши українською мовою. Будь конкретним і actionable.
Використовуй Markdown для форматування відповіді.`;

export async function generateAnalysis(
  entries: Entry[],
  period: 'week' | 'month',
): Promise<string> {
  const periodLabel = period === 'week' ? 'тиждень' : 'місяць';
  const entriesJson = JSON.stringify(
    entries.map((e) => ({
      date: e.recordedAt,
      period: e.period,
      energy: e.energy,
      mood: e.mood,
      anxiety: e.anxiety,
      comment: e.comment,
    })),
    null,
    2,
  );

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Проаналізуй мої записи за ${periodLabel}. Ось дані:\n\n${entriesJson}\n\nНадай структурований звіт з наступними розділами:\n1. 📊 Загальна картина\n2. ✅ Що покращилось\n3. ⚠️ На що звернути увагу\n4. 🔗 Кореляції між показниками\n5. 💡 Порада на наступний ${periodLabel}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text'
    ? textBlock.text
    : 'Не вдалося отримати аналіз.';
}
