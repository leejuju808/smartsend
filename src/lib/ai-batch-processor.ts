// lib/ai-batch-processor.ts
// Utility for parallel AI completions with logging and monitoring

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AIPrompt {
  role: "user" | "system" | "assistant";
  content: string;
}

interface BatchAIRequest {
  prompts: AIPrompt[][]; // Array of message arrays, one per completion
  model?: string;
  temperature?: number;
  max_tokens?: number;
  parallel_tool_calls?: boolean;
}

interface BatchAIResult {
  success: boolean;
  content?: string;
  error?: string;
  index: number;
}

/**
 * Process multiple AI completions in parallel
 * Each prompt array becomes a separate completion request
 */
export async function processBatchCompletions(
  requests: BatchAIRequest[]
): Promise<BatchAIResult[]> {
  const startTime = Date.now();
  const openaiKey = process.env.OPENAI_API_KEY!;

  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  try {
    // Process all requests in parallel
    const promises = requests.map(async (req, index) => {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: req.model || "gpt-4o-mini",
            messages: req.prompts.flat(), // Flatten prompts array
            temperature: req.temperature ?? 0.7,
            max_tokens: req.max_tokens ?? 500,
            parallel_tool_calls: req.parallel_tool_calls ?? true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `OpenAI API error: ${response.status} - ${errorText}`,
            index,
          };
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || "";

        return {
          success: true,
          content,
          index,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          index,
        };
      }
    });

    const results = await Promise.all(promises);
    const runtimeMs = Date.now() - startTime;

    // Log batch processing
    await logAIProcessing("batch-completions", {
      count: requests.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      runtime_ms: runtimeMs,
    });

    return results;
  } catch (error) {
    const runtimeMs = Date.now() - startTime;
    await logAIProcessing("batch-completions", {
      count: requests.length,
      success: 0,
      failed: requests.length,
      runtime_ms: runtimeMs,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Log AI processing to function_logs table
 */
async function logAIProcessing(
  functionName: string,
  metadata: {
    count?: number;
    success?: number;
    failed?: number;
    runtime_ms?: number;
    error?: string;
  }
) {
  try {
    await supabase.from("function_logs").insert({
      fn_name: functionName,
      status: metadata.error ? "error" : metadata.failed && metadata.failed > 0 ? "warning" : "ok",
      runtime_ms: metadata.runtime_ms,
      error_message: metadata.error || null,
      metadata: {
        count: metadata.count,
        success: metadata.success,
        failed: metadata.failed,
      },
    });
  } catch (error) {
    console.error("Failed to log AI processing:", error);
    // Don't throw - logging failures shouldn't break the request
  }
}

/**
 * Helper to create prompts for batch processing
 * Useful when you have multiple leads that need similar AI processing
 */
export function createBatchPrompts<T>(
  items: T[],
  promptBuilder: (item: T) => AIPrompt[]
): BatchAIRequest[] {
  return items.map((item) => ({
    prompts: promptBuilder(item),
    model: "gpt-4o-mini",
    temperature: 0.7,
    parallel_tool_calls: true,
  }));
}

