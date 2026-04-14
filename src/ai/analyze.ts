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

Пиши українською мовою. Використовуй Markdown для форматування відповіді.`;

const BRIEF_PROMPT = `Дай стислий підсумок стану за цей період — 3-4 речення максимум.
Вкажи головну тенденцію і одну конкретну пораду. Без зайвих вступів і структури.`;

const DETAILED_PROMPT = `Надай детальний структурований звіт з розділами:
1. 📊 Загальна картина
2. ✅ Що покращилось
3. ⚠️ На що звернути увагу
4. 🔗 Кореляції між показниками
5. 💡 Порада на наступний період

Будь конкретним і actionable.`;

function formatEntries(entries: Entry[]) {
  return JSON.stringify(
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
}

export async function generateAnalysis(
  entries: Entry[],
  period: 'week' | 'month',
  mode: 'brief' | 'detailed' = 'brief',
  signal?: AbortSignal,
): Promise<string> {
  const periodLabel = period === 'week' ? 'тиждень' : 'місяць';
  const modePrompt = mode === 'brief' ? BRIEF_PROMPT : DETAILED_PROMPT;
  const maxTokens = mode === 'brief' ? 300 : 2048;

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
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
        content: `Ось мої записи за ${periodLabel}:\n\n${formatEntries(entries)}\n\n${modePrompt}`,
      },
    ],
  }, { signal });

  const message = await stream.finalMessage();

  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text'
    ? textBlock.text
    : 'Не вдалося отримати аналіз.';
}
