// Block 451 — Inbox Warmup v2: Adaptive Warmup Schedule
// Multi-inbox coordination • Domain-aware warmup • AI-driven targets

// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    console.log("Starting adaptive warmup schedule generation (v2)...");

    // Fetch all inboxes with warmup_enabled = true, including domain info
    const { data: inboxes, error: inboxError } = await supabase
      .from("sender_inboxes")
      .select(`
        id, 
        workspace_id, 
        domain_id,
        daily_limit, 
        warmup_enabled, 
        warmup_speed,
        sender_domains (
          id,
          domain,
          domain_health_score,
          warmup_stage,
          domain_flags
        )
      `)
      .eq("warmup_enabled", true)
      .eq("connected", true);

    if (inboxError) {
      console.error("Error fetching inboxes:", inboxError);
      return new Response(JSON.stringify({ error: inboxError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!inboxes || inboxes.length === 0) {
      console.log("No inboxes with warmup enabled");
      return new Response(
        JSON.stringify({ ok: true, scheduled: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Get warmup status for all inboxes
    const inboxIds = inboxes.map((i) => i.id);
    const { data: warmupStatuses } = await supabase
      .from("inbox_warmup_status")
      .select("*")
      .in("inbox_id", inboxIds);

    const warmupStatusMap = new Map(
      (warmupStatuses || []).map((ws: any) => [ws.inbox_id, ws])
    );

    let totalScheduled = 0;

    // Group by domain for multi-inbox coordination
    const domainGroups = new Map<string, any[]>();
    for (const inbox of inboxes) {
      const domainId = inbox.domain_id || "no-domain";
      if (!domainGroups.has(domainId)) {
        domainGroups.set(domainId, []);
      }
      domainGroups.get(domainId)!.push(inbox);
    }

    // Process each domain group
    for (const [domainId, domainInboxes] of domainGroups) {
      if (domainId === "no-domain") {
        // Process inboxes without domain grouping
        for (const inbox of domainInboxes) {
          await scheduleInboxWarmup(inbox, warmupStatusMap, domainInboxes);
        }
        continue;
      }

      // Get domain warmup distribution
      const { data: distribution } = await supabase.rpc(
        "get_domain_warmup_distribution",
        { p_domain_id: domainId }
      );

      if (!distribution || !distribution.distribution) {
        console.log(`No distribution for domain ${domainId}`);
        continue;
      }

      // Schedule warmup for each inbox based on distribution
      for (const distItem of distribution.distribution) {
        const inbox = domainInboxes.find((i) => i.id === distItem.inbox_id);
        if (!inbox) continue;

        const warmupStatus = warmupStatusMap.get(inbox.id);
        
        // Skip if paused
        if (warmupStatus?.is_paused) {
          console.log(`Skipping paused inbox ${inbox.id}`);
          continue;
        }

        // Use AI-determined target or distribution target
        const target = warmupStatus?.daily_target || distItem.target || 5;
        const scheduled = await scheduleInboxWarmup(
          inbox,
          warmupStatusMap,
          domainInboxes,
          target
        );
        totalScheduled += scheduled;
      }
    }

    console.log(`Scheduled ${totalScheduled} warmup emails`);

    return new Response(
      JSON.stringify({ ok: true, scheduled: totalScheduled }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in warmup-schedule:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function scheduleInboxWarmup(
  inbox: any,
  warmupStatusMap: Map<string, any>,
  pool: any[],
  targetOverride?: number
): Promise<number> {
  // Skip if domain is disabled or low health
  const domain = inbox.sender_domains;
  if (domain && (
    (domain.domain_flags && domain.domain_flags.includes('auto_disabled')) ||
    (domain.domain_health_score !== null && domain.domain_health_score < 50)
  )) {
    console.log(`Skipping inbox ${inbox.id} - domain ${domain.domain} is disabled or low health`);
    return 0;
  }

  const warmupStatus = warmupStatusMap.get(inbox.id);
  
  // Skip if paused
  if (warmupStatus?.is_paused) {
    return 0;
  }

  // Get target from warmup status (AI-determined) or use override
  const dailyTarget = targetOverride || warmupStatus?.daily_target || 5;

  // Get other inboxes in the same workspace as potential targets
  const targetPool = pool.filter((i) => i.id !== inbox.id);

  if (targetPool.length === 0) {
    console.log(`No other inboxes for warmup targeting (inbox ${inbox.id})`);
    return 0;
  }

  // Check how many already scheduled today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: alreadyScheduled } = await supabase
    .from("warmup_queue")
    .select("*", { count: "exact", head: true })
    .eq("inbox_id", inbox.id)
    .gte("scheduled_for", today.toISOString())
    .is("sent_at", null);

  const remaining = Math.max(0, dailyTarget - (alreadyScheduled || 0));

  if (remaining === 0) {
    return 0;
  }

  let scheduled = 0;

  // Generate warmup emails using AI content generator
  for (let i = 0; i < remaining; i++) {
    const target = targetPool[Math.floor(Math.random() * targetPool.length)];
    const scheduledTime = scheduleTime(i, remaining);

    // Check if this is a reply to existing thread
    const { data: existingThread } = await supabase
      .from("warmup_queue")
      .select("id, subject, body")
      .eq("inbox_id", inbox.id)
      .eq("target_inbox_id", target.id)
      .is("replied_at", null)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    let subject: string;
    let body: string;
    let isReply = false;

    if (existingThread && Math.random() > 0.5) {
      // 50% chance to reply to existing thread
      isReply = true;
      try {
        const contentResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/warmup-content-generator`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              inbox_id: inbox.id,
              target_inbox_id: target.id,
              is_reply: true,
              thread_id: existingThread.id,
            }),
          }
        );
        const contentData = await contentResponse.json();
        if (contentData.ok && contentData.content) {
          subject = contentData.content.subject;
          body = contentData.content.body;
        } else {
          subject = `Re: ${existingThread.subject}`;
          body = generateReplyBody();
        }
      } catch (error) {
        console.error("Error generating reply content:", error);
        subject = `Re: ${existingThread.subject}`;
        body = generateReplyBody();
      }
    } else {
      // Generate new email
      try {
        const contentResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/warmup-content-generator`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              inbox_id: inbox.id,
              target_inbox_id: target.id,
              is_reply: false,
            }),
          }
        );
        const contentData = await contentResponse.json();
        if (contentData.ok && contentData.content) {
          subject = contentData.content.subject;
          body = contentData.content.body;
        } else {
          subject = warmupSubject();
          body = warmupBody();
        }
      } catch (error) {
        console.error("Error generating warmup content:", error);
        subject = warmupSubject();
        body = warmupBody();
      }
    }

    const { error: insertError } = await supabase
      .from("warmup_queue")
      .insert({
        inbox_id: inbox.id,
        target_inbox_id: target.id,
        subject,
        body,
        scheduled_for: scheduledTime.toISOString(),
      });

    if (insertError) {
      console.error(`Error inserting warmup queue item:`, insertError);
    } else {
      scheduled++;
    }
  }

  // Update actual_sent count
  if (warmupStatus) {
    await supabase
      .from("inbox_warmup_status")
      .update({ actual_sent: (warmupStatus.actual_sent || 0) + scheduled })
      .eq("inbox_id", inbox.id);
  }

  return scheduled;
}

/**
 * Schedule warmup emails across the day
 * Spreads messages evenly throughout business hours (9 AM - 5 PM)
 */
function scheduleTime(index: number, total: number): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Business hours: 9 AM to 5 PM (8 hours = 480 minutes)
  const startHour = 9;
  const endHour = 17;
  const totalMinutes = (endHour - startHour) * 60;
  
  // Distribute evenly across the day
  const minutesOffset = Math.floor((totalMinutes / Math.max(1, total - 1)) * index);
  const scheduled = new Date(today);
  scheduled.setHours(startHour, minutesOffset, 0, 0);
  
  // If we're scheduling for today and it's already past this time, schedule for tomorrow
  if (scheduled.getTime() < now.getTime()) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  
  return scheduled;
}

/**
 * Generate random warmup subject
 */
function warmupSubject(): string {
  const options = [
    "Quick Question",
    "Checking In",
    "Following Up",
    "Thanks!",
    "Hello Again",
    "Just Following Up",
    "Quick Check-In",
    "Hope You're Well",
    "Touching Base",
    "Quick Update",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate random warmup body
 */
function warmupBody(): string {
  const sentences = [
    "Appreciate the quick follow-up!",
    "Hope you're having a good day.",
    "Just checking in to keep this thread active.",
    "Thanks for your time.",
    "Looking forward to hearing from you soon.",
    "Hope all is well on your end.",
    "Just wanted to touch base quickly.",
    "Thanks for staying in touch.",
    "Hope you're doing great!",
    "Appreciate you keeping the conversation going.",
  ];
  return sentences[Math.floor(Math.random() * sentences.length)];
}

/**
 * Generate reply body for thread continuation
 */
function generateReplyBody(): string {
  const replies = [
    "Thanks!",
    "Sounds good!",
    "Appreciate it!",
    "Perfect, thanks!",
    "Got it, thanks!",
    "Sounds great!",
    "Thanks for the update!",
    "Appreciate the follow-up!",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

