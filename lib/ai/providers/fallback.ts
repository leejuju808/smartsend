import type { ClassifierProvider, ClassifyResult } from './types';

const contains = (source: string, needle: string) => source.includes(needle);

export class HeuristicClassifier implements ClassifierProvider {
  name = 'heuristic';
  model = 'rule-v1';

  async classify(text: string): Promise<ClassifyResult> {
    const t = (text ?? '').toLowerCase();
    const result = (label: ClassifyResult['label'], confidence = 0.6): ClassifyResult => ({
      label,
      confidence,
      raw: { engine: 'heuristic' },
    });

    if (
      contains(t, 'unsubscribe') ||
      contains(t, 'remove me') ||
      contains(t, 'opt out') ||
      contains(t, 'do not contact')
    ) {
      return result('unsubscribe', 0.95);
    }

    if (contains(t, 'out of office') || contains(t, 'automatic reply') || /away until/i.test(t)) {
      return result('oof', 0.9);
    }

    if (contains(t, 'address not found') || contains(t, '550') || contains(t, 'delivery failure')) {
      return result('bounce', 0.92);
    }

    if (/\?\s*$/.test(t) || contains(t, 'can you') || contains(t, 'what is')) {
      return result('question', 0.75);
    }

    if (contains(t, 'interested') || contains(t, 'schedule') || contains(t, 'let’s talk')) {
      return result('positive', 0.7);
    }

    if (contains(t, 'not interested') || contains(t, 'stop') || contains(t, 'no thanks')) {
      return result('negative', 0.8);
    }

    return result('neutral', 0.55);
  }
}
















