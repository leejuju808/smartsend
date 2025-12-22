export type ClassifyResult = {
  label: 'positive' | 'negative' | 'neutral' | 'question' | 'unsubscribe' | 'bounce' | 'oof';
  confidence: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  raw?: unknown;
};

export interface ClassifierProvider {
  name: string;
  model: string;
  classify(text: string): Promise<ClassifyResult>;
}
















