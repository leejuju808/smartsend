// Block 23280 — SmartSend Quality & Reliability Monitoring v1
// Shared utility for logging errors across all edge functions
// 
// Usage:
//   import { logError } from "../_shared/logError.ts";
//   await logError("payments", "critical", "Payment failed", { job_id: "123", error: err.message });

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

export interface ErrorLogOptions {
  source: string;
  severity?: "info" | "warning" | "error" | "critical";
  message: string;
  details?: Record<string, any>;
}

/**
 * Log a system error to the system_errors table
 * 
 * @param options - Error logging options
 * @returns Promise resolving to the error ID
 */
export async function logError(options: ErrorLogOptions): Promise<string | null> {
  try {
    const { source, severity = "error", message, details = {} } = options;
    
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from("system_errors")
      .insert({
        source,
        severity,
        message,
        details: {
          ...details,
          timestamp: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log error:", error);
      // Fallback to console.error if database logging fails
      console.error(`[${severity.toUpperCase()}] [${source}] ${message}`, details);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    // Fallback logging if everything fails
    console.error(`[ERROR] Failed to log error:`, err);
    console.error(`[${options.severity?.toUpperCase() || "ERROR"}] [${options.source}] ${options.message}`, options.details);
    return null;
  }
}

/**
 * Record a performance metric
 * 
 * @param label - Metric label (e.g., "edge_function_duration_ms")
 * @param value - Metric value
 * @param metadata - Optional metadata
 * @returns Promise resolving to the metric ID
 */
export async function recordMetric(
  label: string,
  value: number,
  metadata?: Record<string, any>
): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from("system_metrics")
      .insert({
        label,
        value,
        metadata: metadata || {},
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to record metric:", error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error(`[ERROR] Failed to record metric:`, err);
    return null;
  }
}

/**
 * Helper to wrap edge function execution with error logging and performance tracking
 * 
 * @param fn - The function to execute
 * @param source - Source identifier for logging
 * @returns Wrapped function result
 */
export async function withMonitoring<T>(
  fn: () => Promise<T>,
  source: string
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    // Record performance metric
    await recordMetric(`${source}_duration_ms`, duration, {
      success: true,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Record error
    await logError({
      source,
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      details: {
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: duration,
      },
    });
    
    // Record failed performance metric
    await recordMetric(`${source}_duration_ms`, duration, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}







































