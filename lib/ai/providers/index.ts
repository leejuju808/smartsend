import { OpenAIClassifier } from "./openai";
import { HeuristicClassifier } from "./fallback";
import type { ClassifierProvider } from "./types";

type ClassifierOptions = {
  model?: string;
};

export function getClassifier(opts?: ClassifierOptions): ClassifierProvider {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (provider === "openai") {
    return new OpenAIClassifier({ model: opts?.model });
  }

  return new HeuristicClassifier();
}