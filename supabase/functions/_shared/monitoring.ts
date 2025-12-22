// Shared monitoring utilities for Edge Functions
// Provides error tracking for Supabase Edge Functions

interface ErrorLog {
  service: string;
  error: string;
  context?: Record<string, any>;
  timestamp: string;
}

export async function logErrorToMonitors(
  service: string,
  error: unknown,
  context?: Record<string, any>
): Promise<void> {
  const errorLog: ErrorLog = {
    service,
    error: error instanceof Error ? error.message : String(error),
    context,
    timestamp: new Date().toISOString(),
  };

  try {
    // Try Sentry if configured
    if (Deno.env.get("SENTRY_DSN")) {
      await fetch("https://o4507885602455552.ingest.us.sentry.io/api/events/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${Deno.env.get("SENTRY_DSN")}`,
        },
        body: JSON.stringify({
          message: errorLog.error,
          level: "error",
          tags: { service: errorLog.service },
          extra: errorLog.context,
          timestamp: errorLog.timestamp,
        }),
      });
    }

    // Try Logflare if configured
    if (Deno.env.get("LOGFLARE_API_KEY")) {
      await fetch("https://api.logflare.app/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": Deno.env.get("LOGFLARE_API_KEY")!,
        },
        body: JSON.stringify({
          source: Deno.env.get("LOGFLARE_SOURCE_ID"),
          log_entry: errorLog,
        }),
      });
    }
  } catch (err) {
    // Fallback to console if all monitors fail
    console.error("Error logging to monitors:", err);
    console.error("Original error:", errorLog);
  }
}

export function captureException(service: string, error: unknown, context?: Record<string, any>): void {
  // Fire and forget
  logErrorToMonitors(service, error, context).catch(() => {
    // Silently fail if logging fails
  });
}

