import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `Ти — персональний AI-асистент для аналізу здоров'я та самопочуття.
Ти аналізуєш щоденні записи користувача про фізичний і ментальний стан.

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

type EntryRow = {
  entryId: number;
  recordedAt: Date;
  period: string;
  itemName: string;
  itemType: string;
  value: string;
};

export type EventLogRow = {
  recordedAt: Date;
  name: string;
  category: string;
  comment: string | null;
};

export type JournalRow = {
  recordedAt: Date;
  text: string;
};

function formatEventRows(rows: EventLogRow[]): string {
  return rows
    .map((r) => {
      const type = r.category === 'event' ? 'Подія' : 'Симптом';
      const comment = r.comment ? ` — "${r.comment}"` : '';
      const date = r.recordedAt.toISOString().slice(0, 16).replace('T', ' ');
      return `${date} | ${type}: ${r.name}${comment}`;
    })
    .join('\n');
}

function buildItemsDescription(rows: EntryRow[]): string {
  const itemMap = new Map<string, string>();
  for (const r of rows) {
    if (!itemMap.has(r.itemName)) {
      const typeDesc =
        r.itemType === 'scale' ? 'шкала 1–10' : r.itemType === 'boolean' ? 'так/ні' : 'текст';
      itemMap.set(r.itemName, typeDesc);
    }
  }
  return Array.from(itemMap.entries())
    .map(([name, type]) => `- ${name} (${type})`)
    .join('\n');
}

function formatEntries(rows: EntryRow[]): string {
  const grouped = new Map<
    number,
    { recordedAt: Date; period: string; values: Record<string, string> }
  >();
  for (const r of rows) {
    if (!grouped.has(r.entryId)) {
      grouped.set(r.entryId, { recordedAt: r.recordedAt, period: r.period, values: {} });
    }
    grouped.get(r.entryId)!.values[r.itemName] = r.value;
  }

  return JSON.stringify(
    Array.from(grouped.values()).map((e) => ({
      date: e.recordedAt,
      period: e.period,
      ...e.values,
    })),
    null,
    2,
  );
}

export async function generateAnalysis(
  rows: EntryRow[],
  period: 'week' | 'month',
  mode: 'brief' | 'detailed' = 'brief',
  signal?: AbortSignal,
  eventRows: EventLogRow[] = [],
  journalRows: JournalRow[] = [],
): Promise<string> {
  const periodLabel = period === 'week' ? 'тиждень' : 'місяць';
  const modePrompt = mode === 'brief' ? BRIEF_PROMPT : DETAILED_PROMPT;
  const maxTokens = mode === 'brief' ? 300 : 2048;
  const itemsDescription = buildItemsDescription(rows);

  const systemWithItems = `${SYSTEM_PROMPT}\n\nКожен запис містить:\n${itemsDescription}`;

  const stream = client.messages.stream(
    {
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: systemWithItems,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Ось мої записи за ${periodLabel}:\n\n${formatEntries(rows)}${
            eventRows.length > 0
              ? `\n\nПодії та симптоми:\n${formatEventRows(eventRows)}`
              : ''
          }${
            journalRows.length > 0
              ? `\n\nНотатки:\n${journalRows.map((r) => `${r.recordedAt.toISOString().slice(0, 16).replace('T', ' ')}: ${r.text}`).join('\n')}`
              : ''
          }\n\n${modePrompt}`,
        },
      ],
    },
    { signal },
  );

  const message = await stream.finalMessage();

  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text'
    ? textBlock.text
    : 'Не вдалося отримати аналіз.';
}
