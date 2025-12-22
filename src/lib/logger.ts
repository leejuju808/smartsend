import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 
  | 'send_queue' 
  | 'reply_detection' 
  | 'stripe_webhook' 
  | 'referral_credit' 
  | 'error' 
  | 'general'
  | 'bounce_classifier'
  | 'ai';

export interface LogContext {
  workspace_id?: string;
  user_id?: string;
  campaign_id?: string;
  email_id?: string;
  queue_id?: string;
  subscription_id?: string;
  [key: string]: any; // Allow additional context fields
}

export interface LogOptions {
  category: LogCategory;
  level: LogLevel;
  message: string;
  context?: LogContext;
  actor?: string; // user_id or system identifier
  stackTrace?: string;
}

/**
 * Structured logger for SmartSend observability
 * All logs are written to system_logs table with JSON payloads
 */
class Logger {
  /**
   * Log an info message
   */
  async info(category: LogCategory, message: string, context?: LogContext, actor?: string): Promise<void> {
    await this.log({
      category,
      level: 'info',
      message,
      context,
      actor,
    });
  }

  /**
   * Log a warning message
   */
  async warn(category: LogCategory, message: string, context?: LogContext, actor?: string): Promise<void> {
    await this.log({
      category,
      level: 'warn',
      message,
      context,
      actor,
    });
  }

  /**
   * Log an error message with optional stack trace
   */
  async error(
    category: LogCategory,
    message: string,
    context?: LogContext,
    actor?: string,
    error?: Error | unknown
  ): Promise<void> {
    let stackTrace: string | undefined;
    
    if (error instanceof Error) {
      stackTrace = error.stack;
    } else if (typeof error === 'string') {
      stackTrace = error;
    }

    await this.log({
      category,
      level: 'error',
      message,
      context,
      actor,
      stackTrace,
    });

    // Trigger alerts for critical error categories
    const criticalCategories: LogCategory[] = ['send_queue', 'stripe_webhook', 'bounce_classifier'];
    if (criticalCategories.includes(category)) {
      try {
        const { alertOnError } = await import('./alerts');
        await alertOnError(category, message, context, error);
      } catch (err) {
        // Don't fail if alerts fail
        console.error('[Logger] Failed to send alert:', err);
      }
    }
  }

  /**
   * Core logging function - writes to system_logs table
   */
  private async log(options: LogOptions): Promise<void> {
    try {
      // Use RPC function for logging (allows service role to bypass RLS)
      const { error } = await supabase.rpc('fn_insert_system_log', {
        p_category: options.category,
        p_level: options.level,
        p_message: options.message,
        p_context: options.context || {},
        p_actor: options.actor || null,
        p_stack_trace: options.stackTrace || null,
      });

      if (error) {
        // Fallback to console if DB write fails (but don't throw)
        console.error('[Logger] Failed to write log:', error);
        console.log(`[${options.category}] ${options.level.toUpperCase()}: ${options.message}`, options.context);
      }
    } catch (err) {
      // Never throw from logger - always fallback to console
      console.error('[Logger] Unexpected error:', err);
      console.log(`[${options.category}] ${options.level.toUpperCase()}: ${options.message}`, options.context);
    }
  }
}

// Export singleton instance
export const log = new Logger();

// Export convenience functions
export const logInfo = (category: LogCategory, message: string, context?: LogContext, actor?: string) =>
  log.info(category, message, context, actor);

export const logWarn = (category: LogCategory, message: string, context?: LogContext, actor?: string) =>
  log.warn(category, message, context, actor);

export const logError = (
  category: LogCategory,
  message: string,
  context?: LogContext,
  actor?: string,
  error?: Error | unknown
) => log.error(category, message, context, actor, error);

