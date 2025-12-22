// SmartSend Queue Worker Edge Function
// Processes pending messages from send_queue_optimized in the background

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logErrorToMonitors } from "../_shared/monitoring.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface QueueItem {
  id: string;
  org_id: string;
  workspace_id?: string;
  type: 'email' | 'whatsapp' | 'sms' | 'linkedin';
  data: Record<string, any>;
  status: string;
  attempt_count: number;
  max_attempts: number;
}

async function markAsCompleted(itemId: string): Promise<void> {
  await supabase
    .from('send_queue_optimized')
    .update({ 
      status: 'sent',
      completed_at: new Date().toISOString()
    })
    .eq('id', itemId);
}

async function markAsFailed(itemId: string, errorMessage: string): Promise<void> {
  await supabase
    .from('send_queue_optimized')
    .update({ 
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', itemId);
}

async function markForRetry(itemId: string, errorMessage: string): Promise<void> {
  await supabase
    .from('send_queue_optimized')
    .update({ 
      status: 'retry',
      error_message: errorMessage,
      attempt_count: supabase.from('send_queue_optimized').select('attempt_count').single(),
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId);
}

async function executeSend(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Processing ${item.type} send for queue item ${item.id}`);
    
    switch (item.type) {
      case 'email':
        return await sendEmail(item);
      case 'whatsapp':
        return await sendWhatsApp(item);
      case 'sms':
        return await sendSMS(item);
      case 'linkedin':
        return await sendLinkedIn(item);
      default:
        return { success: false, error: `Unknown type: ${item.type}` };
    }
  } catch (error) {
    console.error(`Error executing send for ${item.id}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function sendEmail(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  const { to_email, subject, body, from_email } = item.data;
  
  // Call the Gmail send function
  const { data, error } = await supabase.functions.invoke('gmail-send', {
    body: { to_email, subject, body, from_email }
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function sendWhatsApp(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  const { lead_id, body } = item.data;
  
  // Call the WhatsApp send function
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { lead_id, body }
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function sendSMS(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement SMS sending
  return { success: false, error: 'SMS not implemented yet' };
}

async function sendLinkedIn(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  // Call the LinkedIn send function
  const { data, error } = await supabase.functions.invoke('linkedin-send', {
    body: item.data
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

Deno.serve(async (req) => {
  try {
    // Get pending jobs ordered by priority and scheduled_for
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('send_queue_optimized')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(10); // Process up to 10 jobs at a time

    if (fetchError) {
      console.error("Error fetching pending jobs:", fetchError);
      await logErrorToMonitors("queue-worker", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending jobs', processed: 0 }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark jobs as processing
    for (const job of pendingJobs) {
      await supabase
        .from('send_queue_optimized')
        .update({ 
          status: 'processing',
          claimed_at: new Date().toISOString()
        })
        .eq('id', job.id);
    }

    // Process jobs
    let processed = 0;
    let failed = 0;
    
    for (const job of pendingJobs) {
      const result = await executeSend(job);

      if (result.success) {
        await markAsCompleted(job.id);
        processed++;
      } else {
        // Check if we should retry
        if (job.attempt_count < job.max_attempts) {
          await markForRetry(job.id, result.error || 'Unknown error');
        } else {
          await markAsFailed(job.id, result.error || 'Max retries exceeded');
          failed++;
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true,
        processed,
        failed,
        total: pendingJobs.length
      }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    await logErrorToMonitors("queue-worker", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

