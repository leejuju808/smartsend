import OpenAI from 'openai';
import { SequenceDraftSchema } from './schema';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function composeSequence({ prompt, tone }: { prompt: string; tone: keyof typeof import('./presets').TONES }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const { TONES } = await import('./presets');
  const system = TONES[tone]?.system || TONES.direct.system;
  
  const schema = `Return strictly JSON that matches this TypeScript type without backticks or code fences:
  type Step = { step_no: number; wait_seconds: number; subject_template?: string; text_template?: string; html_template?: string };
  type Draft = { name: string; timezone?: string; stop_on_reply?: boolean; send_window?: { days: number[]; start_hour: number; end_hour: number }; throttle_per_tick?: number; steps: Step[] };
  `;
  
  const guide = `Rules:
- 3 to 5 steps.
- Step 1 wait_seconds=0; others 2–5 days (in seconds).
- Use variables like {{contact.first_name}} where natural.
- Keep subjects <= 55 chars.
- Keep body 60–120 words; plain text in text_template, minimal HTML in html_template.
- Single CTA. Avoid spammy words.
- Target timezone from DEFAULT_TIMEZONE if unsure.`;

  const { choices } = await client.chat.completions.create({
    model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: system },
      { role: 'system', content: schema },
      { role: 'system', content: guide },
      { role: 'user', content: prompt }
    ]
  });

  const raw = choices?.[0]?.message?.content || '{}';
  // Extract JSON if model adds prose accidentally
  const jsonStr = raw.trim().replace(/^```(json)?/i, '').replace(/```$/,'');
  const parsed = JSON.parse(jsonStr);
  const draft = SequenceDraftSchema.parse(parsed);
  return draft;
} 