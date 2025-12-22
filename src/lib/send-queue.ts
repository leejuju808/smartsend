import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabaseAdmin";
import { log } from "./logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface QueueItem {
  id: string;
  campaign_id: string;
  user_id: string;
  contact_id?: string;
  email_lower: string;
  name?: string;
  company?: string;
  custom_fields: any;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed';
  attempts: number;
  max_attempts: number;
  error?: string;
  sent_at?: string;
  scheduled_for: string;
  created_at: string;
}

export class SendQueueManager {
  /**
   * Add an email to the send queue
   */
  static async addToQueue({
    campaignId,
    userId,
    email,
    name,
    company,
    customFields = {},
    scheduledFor,
    maxAttempts = 3
  }: {
    campaignId: string;
    userId: string;
    email: string;
    name?: string;
    company?: string;
    customFields?: any;
    scheduledFor?: string;
    maxAttempts?: number;
  }): Promise<QueueItem | null> {
    try {
      const { data, error } = await supabase
        .from("send_queue")
        .insert({
          campaign_id: campaignId,
          user_id: userId,
          email_lower: email.toLowerCase(),
          name: name || null,
          company: company || null,
          custom_fields: customFields,
          status: "pending",
          scheduled_for: scheduledFor || new Date().toISOString(),
          attempts: 0,
          max_attempts: maxAttempts
        })
        .select()
        .single();

      if (error) {
        await log.error('send_queue', 'Error adding to queue', {
          campaign_id: campaignId,
          user_id: userId,
          email,
          error: error.message,
        }, userId, error);
        return null;
      }

      await log.info('send_queue', 'Added email to queue', {
        queue_id: data.id,
        campaign_id: campaignId,
        user_id: userId,
        email,
        scheduled_for: scheduledFor || new Date().toISOString(),
      }, userId);

      return data;
    } catch (error: any) {
      await log.error('send_queue', 'Exception adding to queue', {
        campaign_id: campaignId,
        user_id: userId,
        email,
        error: error?.message || String(error),
      }, userId, error);
      return null;
    }
  }

  /**
   * Get queue items for a user
   */
  static async getQueueItems({
    userId,
    status,
    limit = 100
  }: {
    userId: string;
    status?: string;
    limit?: number;
  }): Promise<QueueItem[]> {
    try {
      let query = supabase
        .from("send_queue")
        .select("*")
        .eq("user_id", userId)
        .order("scheduled_for", { ascending: true })
        .limit(limit);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching queue items:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Error fetching queue items:", error);
      return [];
    }
  }

  /**
   * Execute a specific queue item
   */
  static async executeQueueItem(taskId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke("execute_send", {
        body: { taskId }
      });

      if (error) {
        await log.error('send_queue', 'Error executing queue item', {
          task_id: taskId,
          error: error.message || String(error),
        }, undefined, error);
        return false;
      }

      await log.info('send_queue', 'Successfully executed queue item', {
        task_id: taskId,
      });

      return true;
    } catch (error: any) {
      await log.error('send_queue', 'Exception executing queue item', {
        task_id: taskId,
        error: error?.message || String(error),
      }, undefined, error);
      return false;
    }
  }

  /**
   * Retry a failed queue item
   */
  static async retryQueueItem(taskId: string): Promise<boolean> {
    try {
      // Reset status and schedule for immediate retry
      const { error } = await supabase
        .from("send_queue")
        .update({
          status: "pending",
          error: null,
          scheduled_for: new Date().toISOString()
        })
        .eq("id", taskId);

      if (error) {
        await log.error('send_queue', 'Error retrying queue item', {
          task_id: taskId,
          error: error.message || String(error),
        }, undefined, error);
        return false;
      }

      await log.info('send_queue', 'Retrying queue item', {
        task_id: taskId,
      });

      // Execute immediately
      return await this.executeQueueItem(taskId);
    } catch (error: any) {
      await log.error('send_queue', 'Exception retrying queue item', {
        task_id: taskId,
        error: error?.message || String(error),
      }, undefined, error);
      return false;
    }
  }

  /**
   * Cancel a queue item
   */
  static async cancelQueueItem(taskId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("send_queue")
        .update({ status: "cancelled" })
        .eq("id", taskId);

      if (error) {
        console.error("Error cancelling task:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error cancelling task:", error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(userId: string): Promise<{
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    total: number;
  }> {
    try {
      const { data, error } = await supabase
        .from("send_queue")
        .select("status")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching queue stats:", error);
        return { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 };
      }

      const stats = {
        pending: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        total: data?.length || 0
      };

      data?.forEach((item) => {
        switch (item.status) {
          case "pending":
            stats.pending++;
            break;
          case "sending":
            stats.sending++;
            break;
          case "sent":
            stats.sent++;
            break;
          case "failed":
            stats.failed++;
            break;
        }
      });

      return stats;
    } catch (error) {
      console.error("Error fetching queue stats:", error);
      return { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 };
    }
  }

  /**
   * Bulk add emails to queue
   */
  static async bulkAddToQueue({
    campaignId,
    userId,
    recipients,
    scheduledFor,
    maxAttempts = 3
  }: {
    campaignId: string;
    userId: string;
    recipients: Array<{
      email: string;
      name?: string;
      company?: string;
      customFields?: any;
    }>;
    scheduledFor?: string;
    maxAttempts?: number;
  }): Promise<{ success: number; failed: number }> {
    try {
      const queueItems = recipients.map(recipient => ({
        campaign_id: campaignId,
        user_id: userId,
        email_lower: recipient.email.toLowerCase(),
        name: recipient.name || null,
        company: recipient.company || null,
        custom_fields: recipient.customFields || {},
        status: "pending" as const,
        scheduled_for: scheduledFor || new Date().toISOString(),
        attempts: 0,
        max_attempts: maxAttempts
      }));

      const { data, error } = await supabase
        .from("send_queue")
        .insert(queueItems)
        .select();

      if (error) {
        console.error("Error bulk adding to queue:", error);
        return { success: 0, failed: recipients.length };
      }

      return { 
        success: data?.length || 0, 
        failed: recipients.length - (data?.length || 0) 
      };
    } catch (error) {
      console.error("Error bulk adding to queue:", error);
      return { success: 0, failed: recipients.length };
    }
  }
}

/**
 * Enqueue a followup email with cancellation support
 * This function enqueues an email that will be automatically canceled if the lead replies
 */
export async function enqueueFollowup(input: {
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  email_template_id?: string;
  scheduled_at: string; // ISO timestamp
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("send_queue")
    .insert({
      workspace_id: input.workspace_id,
      campaign_id: input.campaign_id,
      lead_id: input.lead_id,
      email_template_id: input.email_template_id ?? null,
      scheduled_at: input.scheduled_at,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error enqueueing followup:", error);
    return null;
  }
  return data.id as string;
}