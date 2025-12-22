import type { ClassifierProvider, ClassifyResult } from './types';

const LABELS = ['positive', 'negative', 'neutral', 'question', 'unsubscribe', 'bounce', 'oof'] as const;
type Label = (typeof LABELS)[number];

const SYS_PROMPT = `You are a strict email reply classifier for cold outreach.
Allowed labels: positive, negative, neutral, question, unsubscribe, bounce, oof.
Return JSON: {"label":"<one_of_allowed>","confidence":0.00}. Confidence in 0..1. No extra keys.`;

export class OpenAIClassifier implements ClassifierProvider {
  name = 'openai';
  model: string;
  baseUrl: string;
  apiKey: string;

  constructor(opts?: { model?: string; baseUrl?: string; apiKey?: string }) {
    this.model = opts?.model ?? process.env.OPENAI_CLASSIFIER_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = opts?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.apiKey = opts?.apiKey ?? (process.env.OPENAI_API_KEY as string);
  }

  async classify(text: string): Promise<ClassifyResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: SYS_PROMPT },
          { role: 'user', content: text.slice(0, 4000) },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`openai classify failed: ${response.status} ${err}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};

    try {
      parsed = JSON.parse(content);
    } catch {
      // noop
    }

    const label = String((parsed as any).label ?? '').toLowerCase();
    const confidence = Number((parsed as any).confidence ?? 0.6);
    const safeLabel: Label = LABELS.includes(label as Label) ? (label as Label) : 'neutral';

    return {
      label: safeLabel,
      confidence: Math.max(0, Math.min(1, confidence)),
      usage: {
        input_tokens: json.usage?.prompt_tokens,
        output_tokens: json.usage?.completion_tokens,
      },
      raw: json,
    };
  }
}
















